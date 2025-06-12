import json
import hashlib
import os
import re
import jwt
import datetime
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

# --- Настройка путей и конфигурации ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
ALLOWED_EMAILS = ["vladgor2507@mail.ru", "lochakov1990@gmail.com"]
CORS(app, resources={r"/api/*": {"origins": "*"}})
USERS_FILE = os.path.join(BASE_DIR, 'users.json')

# --- Вспомогательные функции ---
def get_users_data():
    if not os.path.exists(USERS_FILE): return {}
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f: return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError): return {}

def save_users_data(data):
    with open(USERS_FILE, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)

def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def is_password_strong(password):
    return (len(password) >= 8 and re.search(r"[a-z]", password) and
            re.search(r"[A-Z]", password) and re.search(r"\d", password) and
            re.search(r"[!@#$%]", password))

# --- Декоратор для проверки JWT ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', ' ').split(" ")[1] if 'Authorization' in request.headers else None
        if not token: return jsonify({'message': 'Токен отсутствует!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user_email = data['email']
            if current_user_email not in ALLOWED_EMAILS:
                return jsonify({'message': 'Пользователь не авторизован'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Недействительный или просроченный токен!'}), 401
        return f(current_user_email, *args, **kwargs)
    return decorated

# --- Эндпоинты ---
@app.route('/')
def serve_index(): return app.send_static_file('index.html')

def create_token(email):
    return jwt.encode({
        'email': email,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm="HS256")

@app.route('/api/check_email', methods=['POST'])
def check_email():
    data = request.get_json()
    email = data.get('email', '').lower()
    if not email: return jsonify({'error': 'Email не предоставлен'}), 400
    if email not in ALLOWED_EMAILS:
        return jsonify({'allowed': False, 'message': 'Этот email не допущен к использованию системы.'})
    users = get_users_data()
    return jsonify({'allowed': True, 'exists': email in users})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email, password = data.get('email', '').lower(), data.get('password')
    if email not in ALLOWED_EMAILS: return jsonify({'error': 'Этот email не допущен к регистрации'}), 403
    if not is_password_strong(password): return jsonify({'error': 'Пароль слишком слабый'}), 400
    users = get_users_data()
    if email in users: return jsonify({'error': 'Пользователь уже существует'}), 409
    users[email] = hash_password(password)
    save_users_data(users)
    return jsonify({'token': create_token(email)}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email, password = data.get('email', '').lower(), data.get('password')
    users = get_users_data()
    if email not in ALLOWED_EMAILS or email not in users or users[email] != hash_password(password):
        return jsonify({'error': 'Неверный email или пароль'}), 401
    return jsonify({'token': create_token(email)}), 200

# --- Эндпоинты для работы с файлами ---
def get_file_details(folder, filename):
    path = os.path.join(folder, filename)
    stats = os.stat(path)
    return {
        'name': filename,
        'size': stats.st_size,
        'modified_date': datetime.datetime.fromtimestamp(stats.st_mtime).isoformat()
    }

@app.route('/api/files', methods=['GET'])
@token_required
def list_files(current_user_email):
    try:
        files_with_details = [get_file_details(UPLOAD_FOLDER, f)
                              for f in os.listdir(UPLOAD_FOLDER)
                              if os.path.isfile(os.path.join(UPLOAD_FOLDER, f))]
        files_with_details.sort(key=lambda x: x['modified_date'], reverse=True)
        return jsonify(files_with_details), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
@token_required
def upload_file(current_user_email):
    if 'file' not in request.files: return jsonify({'error': 'Файл не найден'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'Файл не выбран'}), 400
    filename = secure_filename(file.filename)
    file.save(os.path.join(UPLOAD_FOLDER, filename))
    return jsonify({'message': f'Файл {filename} успешно загружен'}), 201

@app.route('/api/download/<path:filename>')
@token_required
def download_file(current_user_email, filename):
    return send_from_directory(UPLOAD_FOLDER, secure_filename(filename), as_attachment=True)

@app.route('/api/rename/<path:filename>', methods=['PUT'])
@token_required
def rename_file(current_user_email, filename):
    data = request.get_json()
    new_filename = data.get('newName')
    if not new_filename: return jsonify({'error': 'Новое имя файла не предоставлено'}), 400
    old_path = os.path.join(UPLOAD_FOLDER, secure_filename(filename))
    new_path = os.path.join(UPLOAD_FOLDER, secure_filename(new_filename))
    if not os.path.exists(old_path): return jsonify({'error': 'Исходный файл не найден'}), 404
    if os.path.exists(new_path): return jsonify({'error': 'Файл с таким именем уже существует'}), 409
    try:
        os.rename(old_path, new_path)
        return jsonify({'message': 'Файл успешно переименован'}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/files/<path:filename>', methods=['DELETE'])
@token_required
def delete_file(current_user_email, filename):
    file_path = os.path.join(UPLOAD_FOLDER, secure_filename(filename))
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({'message': f'Файл {filename} удален'}), 200
    return jsonify({'error': 'Файл не найден'}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)
