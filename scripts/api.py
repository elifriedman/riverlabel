from tqdm import tqdm
import uuid
import json
import traceback
import subprocess
import sys
from pathlib import Path
import logging
from collections import defaultdict
import os
import threading
from flask import Blueprint, Flask, request, jsonify, render_template_string
from pathlib import Path
from functools import wraps
from scripts.backend import (
    add_new_project_if_needed,
    get_all_tasks,
    get_tasks,
    get_users,
    create_view_for_user,
    delete_view_for_user,
    get_tasks,
    update_task_labelers,
    get_task_by_id,
    signup,
    get_active_users,
)
from label_studio_sdk.client import LabelStudio

app = Blueprint('api', __name__)


env = os.environ.get("ENV", "SERVER")
env = "SERVER"

def load_dotenv(f=".env"):
    for line in Path(f).read_text():
        line = line.strip()
        if line.startswith("#"):
            continue
        k, v = line.split("=")
        os.environ[k] = v

load_dotenv()

ls = LabelStudio(
    base_url="http://localhost:8080", api_key=os.environ.get("LABEL_STUDIO")
API_TOKEN = os.environ.get("API_TOKEN")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-access-token') or request.args.get('token') or request.form.get('token')
        if not token or token != API_TOKEN:
            return jsonify({'message': 'Token is missing or invalid'}), 403
        return f(*args, **kwargs)
    return decorated


@app.route('/admin', methods=['GET'])
@token_required
def admin():
    file = Path(__file__).parent / "admin.html"
    return render_template_string(file.read_text())


@app.route('/users', methods=['GET'])
@token_required
def users():
    emails = request.args.getlist('emails')
    users = get_users(ls, emails if emails else None)
    out = []
    for user in users:
        if "_" in user.username:
            score, active = user.username.split("_")
            score = int(score) if score.isdigit() else 0
            active = active == "1"
        else:
            score = 0
            active = False
        out.append({"email": user.email, "score": score, "active": active})
    return jsonify(out)

@app.route('/updateUsers', methods=['POST'])
@token_required
def update_users():
    data = request.json
    for entry in data:
        email = entry.get('email')
        score = entry.get('score', 0)
        active = entry.get('active', True)
        signup(client=ls, email=email, score=score, active=active)
        if active:
            add_new_project_if_needed(ls, email)
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

def get_title_parts(task):
    title = (task.data.get('stream_idx'), task.data.get('segment_idx'), task.data.get('profile_idx'))
    if all([t is None for t in title]):
        title = task.data["title"]
    return title

@app.route('/tasks', methods=['GET'])
@token_required
def tasks():
    BASE_PROJECT = 34
    project_id = request.args.get('project_id', BASE_PROJECT)
    tasks = get_tasks(ls, project_id, None)
    tasks = sorted(tasks, key=get_title_parts)
    data = [
        {
            "id": task.id,
            "name": task.data["title"],
            "labelers": task.data.get("labelers", []),
            "is_demo": task.data.get("is_demo", False),
        }
        for task in tasks
    ]
    return jsonify(data)


def hash_task(task):
    return str(task.data.get('timeseriesUrl'))

# Dictionary to track task reset status
task_reset_status = {}

def process_task_reset(request_id):
    """Background function to process task reset"""
    try:
        task_reset_status[request_id] = {"status": "processing", "message": "Task reset started"}
        
        BASE_PROJECT = 34
        tasks = get_tasks(ls, BASE_PROJECT, None)
        
        # Step 1: Reset all tasks in base project
        for i, task in enumerate(tqdm(tasks, desc="resetTasks: updating base tasks")):
            task_reset_status[request_id] = {
                "status": "processing", 
                "message": f"Resetting tasks {i+1}/{len(tasks)}"
            }
            task.data["labelers"] = []
            task.data["is_demo"] = False
            ls.tasks.update(task.id, data=task.data)
        
        # Step 2: Reset all user projects
        projects = ls.projects.list()
        user_projects = [p for p in projects if "@" in p.title]
        task_reset_status[request_id] = {
            "status": "processing", 
            "message": f"Resetting {len(user_projects)} user projects"
        }
        
        for i, project in enumerate(tqdm(user_projects, desc="resetTasks: resetting projects")):
            task_reset_status[request_id] = {
                "status": "processing", 
                "message": f"Resetting user project {i+1}/{len(user_projects)}: {project.title}"
            }
            save_and_delete_project(project)
        
        task_reset_status[request_id] = {
            "status": "completed", 
            "message": f"Successfully reset {len(tasks)} tasks and {len(user_projects)} user projects"
        }
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"ERROR", tb)
        task_reset_status[request_id] = {"status": "error", "message": str(exc), "traceback": tb}

@app.route('/resetTasks', methods=['POST'])
@token_required
def reset_tasks():
    # Generate a unique ID for this request
    request_id = str(uuid.uuid4())
    
    # Start the background task
    thread = threading.Thread(target=process_task_reset, args=(request_id,))
    thread.daemon = True
    thread.start()
    
    # Return immediately with the request ID
    return jsonify({
        'message': 'Task reset started in background',
        'request_id': request_id,
        'status_endpoint': f'/taskResetStatus?id={request_id}'
    }), 202  # 202 Accepted


def save_and_delete_project(project):
    tasks = get_tasks(ls, project.id, None)
    tasks = [t for t in tasks if t.annotations]
    ls.tasks.delete_all_tasks(id=project.id)
    if len(tasks) == 0:
        return
    tasks = [json.loads(t.json()) for t in tasks]
    tasks = json.dumps(tasks, ensure_ascii=False)
    path = Path("deleted_tasks") / f"{project.title}_{project.id}_{uuid.uuid4()}.json"
    path.write_text(tasks)


# Dictionary to track task update status
task_update_status = {}

def process_task_updates(data, request_id):
    """Background function to process task updates"""
    email2task = defaultdict(list)
    try:
        task_update_status[request_id] = {"status": "processing", "message": "Task update started"}
        
        active_users = [u.email for u in get_active_users(ls)]
        updates = []
        
        # Step 1: Collect all updates
        for i, entry in enumerate(tqdm(data, desc="updateTasks: getting task updates")):
            task_update_status[request_id] = {"status": "processing", "message": f"Task update started {i+1}/{len(data)}"}
            task_id = entry.get('id')
            emails = list(set(entry.get('labelers') or []))
            is_demo = entry.get("is_demo", False)
            if is_demo:
                emails = active_users
            task = get_task_by_id(ls, task_id)
            no_email_updates = sorted(emails) == sorted(task.data.get("labelers", []))
            demo_updates = is_demo != task.data.get("is_demo")
            if no_email_updates:
                if demo_updates:
                    task.data["labelers"] = emails
                    task.data["is_demo"] = is_demo
                    updates.append(task)
                continue
            for email in task.data.get("labelers", []):
                email2task[email]  # make sure this email is reset if nothing is added
            for email in emails:
                email2task[email].append(task)
            task.data["labelers"] = emails
            task.data["is_demo"] = is_demo
            updates.append(task)
        
        task_update_status[request_id]["message"] = f"Processing {len(updates)} task updates for {len(email2task)} users"
        
        # Step 2: Update user projects
        for i, (email, tasks) in enumerate(tqdm(email2task.items(), desc="updateTasks: adding tasks to projects")):
            task_update_status[request_id]["message"] = f"Updating user #{i+1}/{len(email2task)} {email} with {len(tasks)} tasks"
            project = add_new_project_if_needed(ls, email)
            save_and_delete_project(project)
            tasks = sorted(tasks, key=lambda task: task.data.get("is_demo", False), reverse=True)  # is_demo=True first
            for j, task in enumerate(tasks):
                ls.tasks.create(data=task.data, project=project.id)
        
        # Step 3: Update main project tasks
        for i, task in enumerate(tqdm(updates, desc="updateTasks: updating labelers")):
            task_update_status[request_id]["message"] = f"Processing base task {i+1} / {len(updates)}"
            ls.tasks.update(id=task.id, data=task.data)
        
        task_update_status[request_id] = {"status": "completed", "message": f"Successfully updated {len(updates)} tasks"}
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"ERROR", tb)
        task_update_status[request_id] = {"status": "error", "message": str(exc), "traceback": tb}

@app.route('/updateTasks', methods=['POST'])
@token_required
def update_tasks():
    data = request.json
    
    # Generate a unique ID for this request
    request_id = str(uuid.uuid4())
    
    # Start the background task
    thread = threading.Thread(target=process_task_updates, args=(data, request_id))
    thread.daemon = True
    thread.start()
    
    # Return immediately with the request ID
    return jsonify({
        'message': 'Task update started in background',
        'request_id': request_id,
        'status_endpoint': f'/taskUpdateStatus?id={request_id}'
    }), 202  # 202 Accepted


def reset_password(email, password):
    try:
        result = subprocess.run(
            [str(Path(sys.executable).parent / "label-studio"), 'reset_password', '--username', email, '--password', password],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        success = result.returncode == 0
        return success
    except Exception as exc:
        logging.exception(f"Error running label-studio reset_password --email {email}", exc_info=exc)
        return False


@app.route('/taskResetStatus', methods=['GET'])
@token_required
def task_reset_status_endpoint():
    request_id = request.args.get('id')
    if not request_id or request_id not in task_reset_status:
        return jsonify({'error': 'Invalid or expired request ID'}), 404
    
    status = task_reset_status[request_id]
    
    # Clean up completed or error statuses after they've been retrieved
    if status['status'] in ['completed', 'error']:
        # Keep the status around for a while, but we could remove it here
        pass
        
    return jsonify(status)

@app.route('/taskUpdateStatus', methods=['GET'])
@token_required
def task_update_status_endpoint():
    request_id = request.args.get('id')
    if not request_id or request_id not in task_update_status:
        return jsonify({'error': 'Invalid or expired request ID'}), 404
    
    status = task_update_status[request_id]
    
    # Clean up completed or error statuses after they've been retrieved
    if status['status'] in ['completed', 'error']:
        # Keep the status around for a while, but we could remove it here
        pass
        
    return jsonify(status)

@app.route('/signup', methods=["GET", "POST"])
@token_required
def signup_form():
    if request.method == "GET":
        index_html_path = Path(__file__).parent / "signup.html"
        form_html = index_html_path.read_text()
        return render_template_string(form_html)
    email = request.form.get('email')
    logging.info("Got password reset request")
    try:
        project = signup(ls, email)
        project_id = project.id
    except Exception as exc:
        logging.exception("signup failed", exc_info=exc)
        tb = traceback.format_exc()
        project_id = -1
        print(f"ERROR", tb)
        return render_template_string(f"I'm sorry there was a problem signing up: {tb}".replace("\n", "<br/>"))
    url = f"http://labelstudio.elifdev.com/projects/{project_id}"
    return render_template_string('''
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sign Up Success</title>
                <style>
					body {
						font-family: Arial, sans-serif;
						background-color: #f4f4f9;
						color: #333;
						display: flex;
						justify-content: center;
						align-items: center;
						height: 100vh;
						margin: 0;
					}
					.message {
						background: #fff;
						padding: 20px;
						border-radius: 8px;
						box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
						text-align: left;
						width: fit-content;
					}
					table {
						width: 100%;
						border-collapse: collapse;
					}
					th, td {
						padding: 10px;
						text-align: left;
						border-bottom: 1px solid #ddd;
					}
					a {
						color: #007bff;
						text-decoration: none;
					}
					a:hover {
						text-decoration: underline;
					}
                </style>
            </head>
            <body>
				<div class="message">
                    <h2>Thanks for Signing Up</h2>
					<table>
						<tr>
							<th>Username</th>
							<td>{{ email }}</td>
						</tr>
						<tr>
							<th>Password</th>
							<td><code>abc123</code></td>
						</tr>
						<tr>
							<th>Labeling Link</th>
							<td><a href="{{ url }}">{{ url }}</a></td>
						</tr>
					</table>
				</div>
            </body>
            </html>
        ''', email=email, url=url)

# if __name__ == '__main__':
api_app = app
app = Flask(__name__)
app.register_blueprint(api_app)

# from scripts.labelstudio2 import app as gov_app
# app.register_blueprint(gov_app)
if __name__ == '__main__':
    app.run(debug=False, port=8001)
