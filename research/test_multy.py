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

    @modal.batched(max_batch_size=64, wait_ms=1000)
    def transcribe(self, audio_samples):
        import time
        import numpy as np
        start = time.monotonic_ns()
        print(f"Транскрибируем {len(audio_samples)} аудио файлов")

        if isinstance(audio_samples[0], list):
            audio_samples = [np.array(sample).squeeze() for sample in audio_samples]

        transcriptions = []
        for sample in audio_samples:
            sample = sample.squeeze()
            if len(sample.shape) > 1:
                sample = sample.mean(axis=0)

            print(f"Форма аудио перед обработкой: {sample.shape}")
            result = self.pipeline(
                sample,
                batch_size=1,
                generate_kwargs={"language": "<|ru|>"}
            )
            transcriptions.append(result)
            print(f"Результат распознавания: {result}")

        end = time.monotonic_ns()
        print(
            f"Обработано {len(audio_samples)} файлов за {round((end - start) / 1e9, 2)}с"
        )
        return transcriptions


@app.function()
def transcribe_files(input_files):
    import librosa
    import numpy as np
    import io
    from pydub import AudioSegment

    model = Model()
    audio_data = []
    file_info = []

    for file_content, filename in input_files:
        try:
            # Пробуем сначала через librosa
            try:
                audio_array, sr = librosa.load(io.BytesIO(file_content), sr=16000, mono=True)
            except:
                # Если не получилось, конвертируем через pydub
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
                audio_data.append(audio_array)
                file_info.append(filename)
            else:
                print(f"Ошибка: пустой аудиофайл {filename}")
        except Exception as e:
            print(f"Ошибка при загрузке {filename}: {e}")
            continue

    if not audio_data:
        print("Не удалось загрузить ни одного файла")
        return {}

    print("🔊 Отправляем файлы на обработку")
    print(f"Размеры файлов: {[audio.shape for audio in audio_data]}")

    transcriptions = model.transcribe.remote(audio_data)
    results = {}

    for transcription, filepath in zip(transcriptions, file_info):
        text = transcription.strip()
        print(f"Получена транскрипция для {filepath}: {text}")
        results[filepath] = text

    return results


@app.local_entrypoint()
def main():
    start_time = time.monotonic_ns()
    print("⏱️ Начало выполнения")

    audio_extensions = {'.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'}
    audio_files = []

    for f in Path('.').glob('*'):
        if f.suffix.lower() in audio_extensions:
            try:
                with open(f, 'rb') as audio_file:
                    content = audio_file.read()
                    audio_files.append((content, str(f)))
                    print(f"Прочитан файл {f}, размер: {len(content)} байт")
            except Exception as e:
                print(f"Ошибка при чтении {f}: {e}")

    if not audio_files:
        print("⚠️ Аудиофайлы не найдены в текущей директории")
        end_time = time.monotonic_ns()
        print(f"⏱️ Общее время выполнения: {round((end_time - start_time) / 1e9, 2)}с")
        return

    print(f"📁 Найдено файлов: {len(audio_files)}")
    results = transcribe_files.remote(audio_files)

    for filepath, text in results.items():
        output_path = Path(filepath).with_suffix('.txt')
        print(f"\n📝 Транскрипция файла {filepath}:")
        print(text)
        print("\nСохраняем в", output_path)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(text)

        print("✅ Сохранено")

    end_time = time.monotonic_ns()
    print(f"⏱️ Общее время выполнения: {round((end_time - start_time) / 1e9, 2)}с")
