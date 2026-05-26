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

if __name__ == '__main__':
    app.run(port=5001)