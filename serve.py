#!/usr/bin/env python3
"""Tiny static server with the COOP/COEP headers the PSP emulator needs.  Usage: python3 serve.py [port]"""
import http.server, os, sys, webbrowser, threading

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript', '.json': 'application/json',
                      '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'}
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass

if __name__ == '__main__':
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    srv = None
    for port in range(start, start + 50):          # port busy? try the next one
        try:
            srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), H)
            break
        except OSError:
            print(f'Port {port} is already in use, trying {port + 1} ...')
    if srv is None:
        sys.exit('No free port found - close the other server or pass a port: python3 serve.py 9000')
    url = f'http://localhost:{port}/'
    print(f'\n5 in 1 Solitaire is running.\n  Remake:          {url}\n  Original (PSP):  {url}psp.html\n\nKeep this window open. Ctrl+C to stop.')
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
