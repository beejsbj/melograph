from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from voice_to_strudel.audio import AudioError
from voice_to_strudel.web import analyze_wav_payload

MAX_REQUEST_BYTES = 4_000_000


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Allow", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "invalid Content-Length"})
            return
        if length <= 0:
            self._json(400, {"error": "send a mono 16-bit PCM WAV body"})
            return
        if length > MAX_REQUEST_BYTES:
            self._json(413, {"error": "recording exceeds the 4 MB web limit"})
            return
        try:
            result = analyze_wav_payload(self.rfile.read(length))
        except (AudioError, ValueError) as error:
            self._json(422, {"error": str(error)})
            return
        self._json(200, result)

    def _json(self, status: int, value: dict) -> None:
        payload = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)
