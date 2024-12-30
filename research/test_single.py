import os
import modal
from pathlib import Path
import time

MODEL_DIR = "/model"
MODEL_NAME = "openai/whisper-large-v3"
MODEL_REVISION = "afda370583db9c5359511ed5d989400a6199dfe1"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.1.2",
        "transformers==4.39.3",
        "hf-transfer==0.1.6",
        "huggingface_hub==0.22.2",
        "librosa==0.10.2",
        "soundfile==0.12.1",
        "accelerate==0.33.0",
        "numpy==1.24.3",
        "pydub==0.25.1",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("whisper-batch-inference", image=image)


@app.cls(
    gpu="a10g",
    concurrency_limit=10,
)
class Model:
    @modal.build()
    def download_model(self):
        from huggingface_hub import snapshot_download
        from transformers.utils import move_cache
        os.makedirs(MODEL_DIR, exist_ok=True)

        snapshot_download(
            MODEL_NAME,
            local_dir=MODEL_DIR,
            ignore_patterns=["*.pt", "*.bin"],
            revision=MODEL_REVISION,
        )
        move_cache()

    @modal.enter()
    def load_model(self):
        import torch
        from transformers import (
            AutoModelForSpeechSeq2Seq,
            AutoProcessor,
            pipeline,
        )
        self.processor = AutoProcessor.from_pretrained(MODEL_NAME)
        self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True,
            use_safetensors=True,
        ).to("cuda")
        self.model.generation_config.language = "<|ru|>"
        self.pipeline = pipeline(
            "automatic-speech-recognition",
            model=self.model,
            tokenizer=self.processor.tokenizer,
            feature_extractor=self.processor.feature_extractor,
            torch_dtype=torch.float16,
            device="cuda",
        )

    @modal.method()
    def transcribe(self, audio_sample):
        import numpy as np
        print("Начинаем транскрибацию файла")

        if isinstance(audio_sample, list):
            audio_sample = np.array(audio_sample).squeeze()

        if len(audio_sample.shape) > 1:
            audio_sample = audio_sample.mean(axis=0)

        print(f"Форма аудио перед обработкой: {audio_sample.shape}")
        result = self.pipeline(
            audio_sample,
            batch_size=1,
            generate_kwargs={"language": "<|ru|>"}
        )
        print(f"Результат распознавания: {result['text']}")
        return result["text"]


@app.function()
def transcribe_file(file_content, filename):
    import librosa
    import numpy as np
    import io
    from pydub import AudioSegment

    model = Model()

    try:
        try:
            audio_array, sr = librosa.load(io.BytesIO(file_content), sr=16000, mono=True)
        except:
            print(f"Конвертируем {filename} через pydub")
            audio = AudioSegment.from_file(io.BytesIO(file_content))
            wav_io = io.BytesIO()
            audio.export(wav_io, format='wav')
            wav_io.seek(0)
            audio_array, sr = librosa.load(wav_io, sr=16000, mono=True)

        audio_array = audio_array.squeeze()
        if len(audio_array.shape) > 1:
            audio_array = audio_array.mean(axis=0)

        if len(audio_array) > 0:
            print(f"Успешно загружен файл {filename}, форма: {audio_array.shape}, частота: {sr}")
            transcription = model.transcribe.remote(audio_array)
            return transcription
        else:
            print(f"Ошибка: пустой аудиофайл {filename}")
            return None
    except Exception as e:
        print(f"Ошибка при обработке {filename}: {e}")
        return None


@app.local_entrypoint()
def main():
    start_time = time.monotonic_ns()
    print("⏱️ Начало выполнения")

    audio_extensions = {'.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'}
    audio_file = None

    for f in Path('.').glob('*'):
        if f.suffix.lower() in audio_extensions:
            try:
                with open(f, 'rb') as audio:
                    content = audio.read()
                    print(f"Прочитан файл {f}, размер: {len(content)} байт")
                    audio_file = (content, str(f))
                    break
            except Exception as e:
                print(f"Ошибка при чтении {f}: {e}")

    if not audio_file:
        print("⚠️ Аудиофайл не найден в текущей директории")
        end_time = time.monotonic_ns()
        print(f"⏱️ Общее время выполнения: {round((end_time - start_time) / 1e9, 2)}с")
        return

    content, filepath = audio_file
    text = transcribe_file.remote(content, filepath)

    if text:
        output_path = Path(filepath).with_suffix('.txt')
        print(f"\n📝 Транскрипция файла {filepath}:")
        print(text)
        print("\nСохраняем в", output_path)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(text)

        print("✅ Сохранено")

    end_time = time.monotonic_ns()
    print(f"⏱️ Общее время выполнения: {round((end_time - start_time) / 1e9, 2)}с")
