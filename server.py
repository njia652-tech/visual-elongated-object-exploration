from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import base64
import os
import csv
import time

#python server.py

app = Flask(__name__)

# ✅ 启用 CORS 支持 — 配置允许的来源
ALLOWED_ORIGIN = 'http://localhost:5180'
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGIN}})

os.makedirs('screenshots', exist_ok=True)
CSV_FILE = 'record.csv'

# 可选：初始化 CSV
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
        'sessionId',
        'model',
        'actionId',
        's_t_img',
        's_t1_img',
        'after_yaw','after_pitch',
        'delta_yaw','delta_pitch',
        'init_yaw','init_pitch'   # filled on init row (actionId = -1)
        't_start_ms','t_end_ms','duration_ms','server_received_ms'
    ])

@app.route('/record', methods=['POST', 'OPTIONS'])
def record():
    # ✅ 手动处理预检请求（关键）
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN

        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        return response

    # ✅ 正常 POST 请求
    data = request.get_json()
    sessionId = data.get('sessionId', '')
    after = (data.get('afterAngles') or {})
    delta = (data.get('deltaAngles') or {})
    initial = (data.get('initialAngles') or {})  # present only for init row
    modelName = data['modelName']
    s_t_img = data['s_t_img']
    s_t1_img = data['s_t1_img']
    actionId = data['actionId']
    t_start_ms = data.get('t_start_ms')
    t_end_ms = data.get('t_end_ms')
    duration_ms = data.get('duration_ms')
    server_received_ms = int(time.time() * 1000)

    print(f"Saving image: {initial.get('yaw')}, {initial.get('pitch')} -> {after.get('yaw')}, {after.get('pitch')}，delta: {delta.get('yaw')}, {delta.get('pitch')}")
    if actionId != -1:
        if data.get('imgData1', '').startswith('data:image'):
            imgData1 = data['imgData1'].split(',')[1]
            with open(f'screenshots/{s_t_img}', 'wb') as f:
                f.write(base64.b64decode(imgData1))

        if data.get('imgData2', '').startswith('data:image'):
            imgData2 = data['imgData2'].split(',')[1]
            with open(f'screenshots/{s_t1_img}', 'wb') as f:
                f.write(base64.b64decode(imgData2))


    with open(CSV_FILE, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            sessionId,
            modelName,
            actionId,
            s_t_img,
            s_t1_img,
            after.get('yaw'), after.get('pitch'),
            delta.get('yaw'), delta.get('pitch'),
            initial.get('yaw'), initial.get('pitch'),
            t_start_ms, t_end_ms, duration_ms, server_received_ms
        ])


    # ✅ 必须添加跨域头
    response = make_response(jsonify({'status': 'ok'}))
    response.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    return response

@app.route('/memory_result', methods=['POST'])
def memory_result():
    data = request.get_json()
    sessionId = data.get('sessionId', '')
    results = data.get('results', [])
    file_path = 'memory_test_results.csv'
    file_exists = os.path.isfile(file_path)
    file_is_empty = not file_exists or os.path.getsize(file_path) == 0
    if not results:
        return jsonify({'status': 'error', 'message': 'No results provided'}), 400


    # 保存为 CSV（可换成你自己路径）
    with open('memory_test_results.csv', 'a', newline='') as csvfile:
        writer = csv.writer(csvfile)
        if file_is_empty:
            writer.writerow(['timestamp', 'modelName', 'memoryTestRound', 'guessed', 'actuallySeen', 'correct'])
        for entry in results:
            writer.writerow([
                sessionId,
                entry.get('timestamp'),
                entry.get('modelName'),
                entry.get('memoryTestRound'),
                entry.get('guessed'),
                entry.get('actuallySeen'),
                entry.get('correct')
            ])

    return jsonify({'status': 'success'}), 200


# ────────────────────────────────────────────────────────────────────
#  Exp1/Exp2 View Selection endpoints (EXP1_EXP2_IMPLEMENTATION_PLAN.md)
#
#  Data layout (plan §7 / §4.4): one directory per experiment, four files
#  per participant —
#    data/{experiment}/P{id}_view_record.csv
#    data/{experiment}/P{id}_probe.csv
#    data/{experiment}/P{id}_samples.csv
#    data/{experiment}/P{id}_block_events.csv
#  (Replaces the old single shared view_record.csv / view_probe.csv /
#  view_trajectory.csv files from the pre-redesign 40-trial Set A/B version.)
# ────────────────────────────────────────────────────────────────────

DATA_ROOT = 'data'

VIEW_HEADERS = [
    'participant_id', 'experiment', 'task', 'object_id', 'body_type', 'symmetry',
    'exposure_index', 'trial_index', 'task_order',
    'start_azimuth', 'final_azimuth', 'final_elevation',
    'axis_category', 'feature_category',
    'confirmation_latency', 'enter_pressed', 'timeout',
    'cumulative_rotation_steps', 'criterion_met',
    'up_down_count', 'left_right_count',
    'timestamp',
]
PROBE_HEADERS = [
    'participant_id', 'task', 'block_index', 'block_probe_index',
    'after_trial_index', 'answer', 'timestamp',
]
SAMPLE_HEADERS = [
    'participant_id', 'task', 'object_id', 'trial_index',
    'timestamp_ms', 'azimuth', 'elevation',
]
BLOCK_EVENTS_HEADERS = [
    'participant_id', 'block_index', 'task', 'task_order',
    'rest_start_ms', 'rest_end_ms', 'instruction_confirm_ms',
    'block_start_ms', 'block_end_ms',
]

def _safe_participant_id(pid):
    # Guard against path traversal / stray characters landing in a filename.
    pid = str(pid or 'UNKNOWN')
    cleaned = ''.join(c for c in pid if c.isalnum() or c in ('-', '_'))
    return cleaned or 'UNKNOWN'

def _safe_experiment(exp):
    exp = str(exp or 'exp1')
    return exp if exp in ('exp1', 'exp2') else 'exp1'

def _participant_csv_path(experiment, participant_id, kind):
    experiment = _safe_experiment(experiment)
    pid = _safe_participant_id(participant_id)
    directory = os.path.join(DATA_ROOT, experiment)
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f'P{pid}_{kind}.csv')

def _append_row(path, headers, row):
    file_exists = os.path.exists(path)
    with open(path, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)

def _cors_response(payload):
    resp = make_response(jsonify(payload))
    resp.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp

def _options_response():
    resp = make_response()
    resp.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp


@app.route('/check_participant', methods=['GET', 'OPTIONS'])
def check_participant():
    """Used by the welcome screen to prevent accidentally re-using a participant ID
    (plan §7: "校验 ID 格式与重复")."""
    if request.method == 'OPTIONS':
        return _options_response()

    experiment = _safe_experiment(request.args.get('experiment', 'exp1'))
    participant_id = request.args.get('participant_id', '')
    path = _participant_csv_path(experiment, participant_id, 'view_record')
    return _cors_response({'exists': os.path.exists(path)})


@app.route('/record_view', methods=['POST', 'OPTIONS'])
def record_view():
    if request.method == 'OPTIONS':
        return _options_response()

    d = request.get_json()
    path = _participant_csv_path(d.get('experiment', 'exp1'), d.get('participant_id', ''), 'view_record')
    _append_row(path, VIEW_HEADERS, d)
    return _cors_response({'status': 'ok'})


@app.route('/probe_result', methods=['POST', 'OPTIONS'])
def probe_result():
    if request.method == 'OPTIONS':
        return _options_response()

    d = request.get_json()
    path = _participant_csv_path(d.get('experiment', 'exp1'), d.get('participant_id', ''), 'probe')
    _append_row(path, PROBE_HEADERS, d)
    return _cors_response({'status': 'ok'})


@app.route('/sample_log', methods=['POST', 'OPTIONS'])
def sample_log():
    if request.method == 'OPTIONS':
        return _options_response()

    d = request.get_json()
    participant_id = d.get('participant_id', '')
    experiment     = d.get('experiment', 'exp1')
    task           = d.get('task', '')
    object_id      = d.get('object_id', '')
    trial_index    = d.get('trial_index', '')
    samples        = d.get('samples', [])

    path = _participant_csv_path(experiment, participant_id, 'samples')
    file_exists = os.path.exists(path)
    with open(path, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=SAMPLE_HEADERS, extrasaction='ignore')
        if not file_exists:
            writer.writeheader()
        for s in samples:
            writer.writerow({
                'participant_id': participant_id,
                'task':           task,
                'object_id':      object_id,
                'trial_index':    trial_index,
                'timestamp_ms':   s.get('timestamp_ms'),
                'azimuth':        s.get('azimuth'),
                'elevation':      s.get('elevation'),
            })

    return _cors_response({'status': 'ok'})


@app.route('/block_event', methods=['POST', 'OPTIONS'])
def block_event():
    """One row per block per participant (plan §4.4). The client sends this once
    per block, right after block_end_ms is known (i.e. right after the block's
    last trial is recorded, before showing the rest/instruction page leading
    into the next block)."""
    if request.method == 'OPTIONS':
        return _options_response()

    d = request.get_json()
    path = _participant_csv_path(d.get('experiment', 'exp1'), d.get('participant_id', ''), 'block_events')
    _append_row(path, BLOCK_EVENTS_HEADERS, d)
    return _cors_response({'status': 'ok'})


if __name__ == '__main__':
    app.run(port=5006)
