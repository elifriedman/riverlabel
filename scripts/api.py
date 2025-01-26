import os
from flask import Blueprint, Flask, request, jsonify
from functools import wraps
from backend import get_users, update_user_score, create_view_for_user, delete_view_for_user, get_tasks, update_task_labelers, get_task_by_id
from label_studio_sdk.client import LabelStudio

app = Blueprint('api', __name__)


env = os.environ.get("ENV", "SERVER")

if env == "LOCAL":
    ls = LabelStudio(
        base_url="http://localhost:8080", api_key=""
    )
else:
    ls = LabelStudio(
        base_url="https://labelstudio.elifdev.com", api_key=""
    )
API_TOKEN = "example_token"

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-access-token')
        if not token or token != API_TOKEN:
            return jsonify({'message': 'Token is missing or invalid'}), 403
        return f(*args, **kwargs)
    return decorated

@app.route('/users', methods=['GET'])
@token_required
def users():
    emails = request.args.getlist('emails')
    users = get_users(ls, emails if emails else None)
    return jsonify([{"email": user.email, "score": user.username} for user in users])

@app.route('/updateUsers', methods=['POST'])
@token_required
def update_users():
    data = request.json
    for entry in data:
        email = entry.get('email')
        score = entry.get('score')
        active = entry.get('active')
        update_user_score(ls, email, score, active)
    return jsonify({'message': 'Users updated successfully'}), 200

@app.route('/createViews', methods=['POST'])
@token_required
def create_views():
    data = request.json
    project_id = data.get('project_id')
    email = data.get('email')
    users = get_users(ls, [email])
    if len(users) == 0:
        return jsonify({'error': f'No user found: {email=}'}), 501
    user = users[0]
    views = create_view_for_user(ls, project_id, user)
    return jsonify({'message': 'Views created successfully'}), 200

@app.route('/deleteViews', methods=['POST'])
@token_required
def delete_views():
    data = request.json
    project_id = data.get('project_id')
    email = data.get('email')
    users = get_users(ls, [email])
    if len(users) == 0:
        return jsonify({'error': f'No user found: {email=}'}), 501
    user = users[0]
    views = delete_view_for_user(ls, project_id, user)
    return jsonify({'message': 'Views deleted successfully'}), 200

@app.route('/tasks', methods=['GET'])
@token_required
def tasks():
    project_id = request.args.get('project_id')
    tasks = get_tasks(ls, project_id)
    return jsonify([{"id": task.id, "data": task.data} for task in tasks])

@app.route('/assignTasks', methods=['POST'])
@token_required
def assign_tasks():
    data = request.json
    for entry in data:
        task_id = entry.get('task')
        emails = entry.get('emails')
        task = get_task_by_id(ls, task_id)
        update_task_labelers(ls, task, emails)
    return jsonify({'message': 'Tasks assigned successfully'}), 200

if __name__ == '__main__':
    api_app = app
    app = Flask(__name__)
    app.register_blueprint(api_app)

    try:
        from govmap_loader import app as gov_app
        app.register_blueprint(gov_app)
    except Exception as exc:
        pass
    app.run(debug=False, port=8001)

