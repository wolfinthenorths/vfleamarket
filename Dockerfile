FROM python:3.12-slim
WORKDIR /app
COPY data/assets.json /app/data/assets.json
COPY scripts/download_assets.py /app/scripts/download_assets.py
RUN python -m pip install --no-cache-dir Pillow==11.3.0 && python scripts/download_assets.py
COPY . .
ENV PYTHONUNBUFFERED=1 PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["python", "server.py"]

