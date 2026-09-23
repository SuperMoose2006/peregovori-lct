#!/usr/bin/env python3
"""Read-only HTTP checks and disposable text games on the public demo.

Run with the gateway's Python environment; cloud AI must be disabled.
"""
import argparse
import asyncio
import json
import ssl
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import certifi
import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus


async def event(ws, kind, *, turn=None, timeout=20):
    async with asyncio.timeout(timeout):
        while True:
            item = json.loads(await ws.recv())
            if item.get('type') == 'error':
                raise AssertionError(item)
            if item.get('type') == kind and (turn is None or item.get('turn_id') == turn):
                return item


async def main(args):
    base = args.url.rstrip('/')
    ws_url = base.replace('https://', 'wss://', 1) + '/v1/realtime?mode=text'
    # Match HTTPX's CA store; python.org macOS installs may lack system CAs.
    tls = ssl.create_default_context(cafile=certifi.where())
    report = {'url': base, 'checked_at': datetime.now(timezone.utc).isoformat()}
    async with httpx.AsyncClient(timeout=20) as client:
        health = await client.get(base + '/api/health')
        health.raise_for_status()
        report['health'] = health.json()
        assert report['health']['cloud_ai'] is False, 'Load checks require NEGO_AI=off'
        page = await client.get(base)
        assert page.status_code == 200 and '<html' in page.text
        assert page.headers['strict-transport-security'] == 'max-age=31536000'
        redirect = await client.get(base.replace('https://', 'http://') + '/')
        assert redirect.status_code == 308 and redirect.headers['location'] == base + '/'
        for path in ('/.env', '/.git/config', '/v1/chat/completions', '/v1/audio/speech', '/v1/models'):
            response = await client.get(base + path, headers={'X-Forwarded-For': '127.0.0.1'})
            assert response.status_code == 404, (path, response.status_code)
        report['http_tls_redirect_private_routes'] = 'passed'
        responses = await asyncio.gather(*[client.get(base + '/api/health') for _ in range(20)])
        assert all(r.status_code == 200 for r in responses)
        report['parallel_health_requests'] = len(responses)

    try:
        async with websockets.connect(ws_url, origin='https://example.invalid', ssl=tls):
            raise AssertionError('Foreign Origin was accepted')
    except InvalidStatus as exc:
        assert exc.response.status_code == 403
    report['foreign_origin_rejected'] = True

    async with websockets.connect(ws_url, origin=base, ssl=tls) as ws:
        await event(ws, 'session.queue_done')
        timeout_event = json.loads(await asyncio.wait_for(ws.recv(), 15))
        assert timeout_event.get('error', {}).get('code') == 'init_timeout', timeout_event
        try:
            await ws.recv()
            raise AssertionError('Idle connection stayed open')
        except ConnectionClosed as exc:
            assert exc.rcvd.code == 1008
    report['idle_init_timeout'] = 'passed'

    sockets = []
    latencies = []
    try:
        # Forwarded-header spoofing must not bypass the per-IP cap.
        for _ in range(args.per_ip + 1):
            ws = await websockets.connect(ws_url, origin=base, ssl=tls,
                additional_headers={'X-Forwarded-For': '127.0.0.1'})
            sockets.append(ws)
            await event(ws, 'session.queue_done')
            await ws.send(json.dumps({'type': 'session.init', 'payload': {
                'scenarioId': 'supplier', 'lang': 'ru', 'gameMode': 'practice'}}))
            reply = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if len(sockets) <= args.per_ip:
                assert reply['type'] == 'session.created', reply
            else:
                assert reply.get('error', {}).get('code') == 'too_many_sessions', reply
        report['per_ip_limit_including_spoofed_header'] = args.per_ip

        async def play(ws):
            lines = [
                'Здравствуйте. Что для вас важнее всего в этой сделке?',
                'А если мы увеличим объём, вы сможете снизить цену?',
                'Давайте сравним три независимых предложения и обсудим сроки.',
            ]
            for turn, line in enumerate(lines, 1):
                start = time.perf_counter()
                await ws.send(json.dumps({'type': 'input.append', 'input': {'text': line}}))
                await ws.send(json.dumps({'type': 'input.commit'}))
                await event(ws, 'engine.state', turn=turn)
                latencies.append((time.perf_counter() - start) * 1000)
            await ws.send(json.dumps({'type': 'session.close', 'reason': 'deployment_check'}))

        await asyncio.gather(*[play(ws) for ws in sockets[:args.per_ip]])
        report['simultaneous_games'] = args.per_ip
        report['completed_turns'] = len(latencies)
        report['turn_latency_ms'] = {'median': round(statistics.median(latencies)),
            'p95': round(sorted(latencies)[int(len(latencies) * .95)]),
            'max': round(max(latencies))}
    finally:
        await asyncio.gather(*[ws.close() for ws in sockets], return_exceptions=True)
    Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='https://dialog.2-26-49-28.nip.io')
    parser.add_argument('--per-ip', type=int, default=12)
    parser.add_argument('--out', required=True)
    asyncio.run(main(parser.parse_args()))
