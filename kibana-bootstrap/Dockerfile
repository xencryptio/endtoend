FROM curlimages/curl:8.7.1

USER root
WORKDIR /work

COPY bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

# /import is mounted at runtime with the ndjson files
VOLUME ["/import"]

ENTRYPOINT ["/usr/local/bin/bootstrap.sh"]
