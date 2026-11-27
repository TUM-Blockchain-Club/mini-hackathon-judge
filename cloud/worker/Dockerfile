FROM debian:bookworm-slim AS guest
RUN apt-get update && apt-get install -y --no-install-recommends bash coreutils util-linux python3 python3-openpyxl python3-docx poppler-utils tesseract-ocr nodejs npm git && rm -rf /var/lib/apt/lists/* && mkdir -p /input /export /srv/submission /srv/reference
COPY scripts/judge-read.py /usr/local/bin/judge-read
RUN chmod 755 /usr/local/bin/judge-read

FROM python:3.12-slim-bookworm
COPY --from=guest / /guest/
COPY judge/fixtures/tax-sample.json /opt/judge/tax-sample.json
COPY cloud/worker/unpack.py /guest/usr/local/lib/unpack.py
COPY cloud/worker/main.py /opt/judge/main.py
WORKDIR /opt/judge
ENTRYPOINT ["python3", "-u", "/opt/judge/main.py"]
