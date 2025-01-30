import time
import subprocess
import logging
from label_studio_sdk.client import LabelStudio
from flask import Blueprint, Flask, render_template_string, request

app = Blueprint('govmap', __name__)
logging.basicConfig(format='%(asctime)s:%(name)s:%(levelname)s:%(funcName)s:%(message)s')

@app.route('/map', methods=['GET'])
def map():
    center_x = request.args.get('center_x', default=183965.46, type=float)
    center_y = request.args.get('center_y', default=659428.42, type=float)
    line_start_x = request.args.get('line_start_x', default=184067.33, type=float)
    line_start_y = request.args.get('line_start_y', default=659523.68, type=float)
    line_end_x = request.args.get('line_end_x', default=184046.82, type=float)
    line_end_y = request.args.get('line_end_y', default=659277.61, type=float)
    previous_line_start_x = request.args.get('prev_line_start_x', default=0, type=float)
    previous_line_start_y = request.args.get('prev_line_start_y', default=0, type=float)
    next_line_start_x = request.args.get('next_line_start_x', default=0, type=float)
    next_line_start_y = request.args.get('next_line_start_y', default=0, type=float)
    previous_line_end_x = request.args.get('prev_line_end_x', default=0, type=float)
    previous_line_end_y = request.args.get('prev_line_end_y', default=0, type=float)
    next_line_end_x = request.args.get('next_line_end_x', default=0, type=float)
    next_line_end_y = request.args.get('next_line_end_y', default=0, type=float)

    index_html = f"""
    <html>
    <head>
        <script src="https://code.jquery.com/jquery-1.12.1.min.js"></script>
        <script src="https://www.govmap.gov.il/govmap/api/govmap.api.js"></script>
        <script type="text/javascript">
            function getLineData(x1, y1, x2, y2, arrowDirection) {{
                const arrowLength = 8;
                const distance = 4
                let lineCenterX = (x1 + x2) / 2;
                let lineCenterY = (y1 + y2) / 2;
				const angle = Math.atan2(y2 - y1, x2 - x1);
				

				const perpendicularAngle = angle + arrowDirection * Math.PI / 2;
                lineCenterX += distance * Math.cos(perpendicularAngle);
                lineCenterY += distance * Math.sin(perpendicularAngle);

				const arrowPoint1X = lineCenterX + arrowLength * Math.cos(angle);
				const arrowPoint1Y = lineCenterY + arrowLength * Math.sin(angle);
				const arrowPoint2X = lineCenterX - arrowLength * Math.cos(angle);
				const arrowPoint2Y = lineCenterY - arrowLength * Math.sin(angle);
				const arrowPointTipX = lineCenterX + arrowLength * Math.cos(perpendicularAngle);
				const arrowPointTipY = lineCenterY + arrowLength * Math.sin(perpendicularAngle);

                const wkt = [
                            `LINESTRING(${{x1}} ${{y1}}, ${{x2}} ${{y2}})`,
                            `LINESTRING(
                                ${{lineCenterX}} ${{lineCenterY}},
                                ${{arrowPoint1X}} ${{arrowPoint1Y}},
                                ${{arrowPointTipX}} ${{arrowPointTipY}},
                                ${{arrowPoint2X}} ${{arrowPoint2Y}},
                                ${{lineCenterX}} ${{lineCenterY}}
                            )`
                        ];
                return wkt;
            }}

            function startDisplay(centerX, centerY, data) {{
                govmap.zoomToXY({{x: centerX, y: centerY, level: 8}});
                govmap.displayGeometries(data).then(function(response) {{
                    console.log(response.data);
                }});
            }}
			function calculateArrowDirection(lineStart, lineEnd, lineStartNext, lineEndNext) {{
              if (lineStartNext == 0) {{
                  return 1;
              }}
			  const dx1 = lineEnd[0] - lineStart[0];
			  const dy1 = lineEnd[1] - lineStart[1];
			  const dx2 = lineEndNext[0] - lineStartNext[0];
			  const dy2 = lineEndNext[1] - lineStartNext[1];

			  const length2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
			  const perpLine = [-dy2 / length2, dx2 / length2];

			  const length1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
			  const normLine = [dx1 / length1, dy1 / length1];

			  const dotProduct = perpLine[0] * normLine[0] + perpLine[1] * normLine[1];

			  const angle = Math.acos(dotProduct) * (180 / Math.PI);

			  return angle > 0 ? 1 : -1;

			  //const crossProduct = (lineEnd[0] - lineStart[0]) * (lineEndNext[1] - lineStartNext[1]) -
			  //  				   (lineEnd[1] - lineStart[1]) * (lineEndNext[0] - lineStartNext[0]);

              //console.log("crossProduct", crossProduct);
			  //return crossProduct >= 0 ? 1 : -1;
			}}

            function drawInitial() {{
                const center = [{center_x}, {center_y}];
                const lineStart = [{line_start_x}, {line_start_y}];
                const lineEnd = [{line_end_x}, {line_end_y}];
                const lineStartPrev = [{previous_line_start_x}, {previous_line_start_y}];
                const lineEndPrev = [{previous_line_end_x}, {previous_line_end_y}];
                const lineStartNext = [{next_line_start_x}, {next_line_start_y}];
                const lineEndNext = [{next_line_end_x}, {next_line_end_y}];
                const arrow = calculateArrowDirection(lineStart, lineEnd, lineStartNext, lineEndNext);
                const wkt = getLineData(lineStart[0], lineStart[1], lineEnd[0], lineEnd[1], arrow);
                const wktPrev = getLineData(lineStartPrev[0], lineStartPrev[1], lineEndPrev[0], lineEndPrev[1], arrow);
                const wktNext = getLineData(lineStartNext[0], lineStartNext[1], lineEndNext[0], lineEndNext[1], arrow);
                const wkts = [].concat(wkt).concat(wktPrev).concat(wktNext);
                const data = {{
                    wkts: wkts,
                    names: ['p1', 'a1', 'p2', 'a2', 'p3', 'a3'],
                    geometryType: govmap.drawType.Polyline,
                    defaultSymbol:
                    {{
                        color: [0, 255, 0, 1],
                        width: 2,
                    }},
                    symbols: [
                    {{
                        color: [0, 255, 0, 1],
                        width: 2,
                    }},
                    {{
                        color: [0, 255, 0, 1],
                        width: 2,
                    }},
                    {{
                        color: [128, 128, 128, 1],
                        width: 2,
                    }},
                    {{
                        color: [128, 128, 128, 1],
                        width: 2,
                    }},
                    {{
                        color: [128, 0, 0, 1],
                        width: 2,
                    }},
                    {{
                        color: [128, 0, 0, 1],
                        width: 2,
                    }}
                    ],
                    learExisting: true,
                    data: {{
                        tooltips: ['קו גובה'],
                    }}
                }};
                startDisplay(center[0], center[1], data);
            }}

            function loadMap() {{
                govmap.createMap('map',
                {{
                    token: '5a4b8472-b95b-4687-8179-0ccb621c7990',
                    visibleLayers: ["WATER_FLOW"],
                    showXY: true,
                    identifyOnClick: false,
                    center: {{x: {center_x}, y: {center_y}}},
                    level: 8,
                    isEmbeddedToggle: false,
                    background: 1,
                    bgButton: true,
                    zoomButton: true,
                    layersMode: 3,
                    zoomButtons: true,
                    onLoad: drawInitial,
                }});
            }};
        </script>
    </head>
    <body>
        <div id="map" style="width:100%;height:600px"></div>
        <script>loadMap()</script>
    </body>
    </html>
    """

    return render_template_string(index_html)

def check_user(email):
    ls = LabelStudio(base_url="https://labelstudio.elifdev.com", api_key="fa886fbd4e564262c73f0860e9162979d232eb95")
    users = ls.users.list()
    for user in users:
        if email == user.email:
            return True
    return False

@app.route('/resetpassword', methods=['POST'])
def reset_password():
    email = request.form.get('email')
    password = request.form.get('password')
    logging.info("Got password reset request")
    response = "Success!", 200
    print(f"RUNNING")
    if not (email and password):
        return {'status': 'error', 'message': 'Missing email or password'}, 400
    if not check_user(email):
        logging.error(f"reset_password: invalid email {email}")
        time.sleep(1)
        return response
    try:
        result = subprocess.run(
            ['/home/shakedfried/venv/bin/label-studio', 'reset_password', '--username', email, '--password', password],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        if result.returncode != 0:
            logging.error(f"Error running label-studio reset_password --email {email}: {result.stderr}")
        else:
            logging.info(f"Reset password for {email}")
        return response
    except Exception as exc:
        logging.exception(f"Error running label-studio reset_password --email {email}", exc_info=exc)
        return response

@app.route('/resetpassword', methods=['GET'])
def reset_password_form():
    form_html = '''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password</title>
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
            form {
                background: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            label {
                display: block;
                margin-bottom: 8px;
                margin-top: 20px;
            }
            input[type="text"],
            input[type="password"] {
                width: 100%;
                padding: 8px;
                margin-top: 5px;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            input[type="submit"] {
                width: 100%;
                padding: 10px;
                margin-top: 20px;
                border: none;
                border-radius: 4px;
                background-color: #007bff;
                color: white;
                font-size: 16px;
                cursor: pointer;
                transition: background-color 0.3s;
            }
            input[type="submit"]:hover {
                background-color: #0056b3;
            }
        </style>
    </head>
    <body>
        <form action="/resetpassword" method="post">
            <h2>Reset Your Password</h2>
            <label for="email">Email</label>
            <input type="text" name="email" id="email" required>
            <label for="password">New Password</label>
            <input type="password" name="password" id="password" required>
            <input type="submit" value="Reset Password">
        </form>
		<p id="success" style="color: green; display:none;">Successfully changed</p>
    </body>
    </html>
    '''
    return render_template_string(form_html)

if __name__ == '__main__':
    app.run(debug=False, port=8001)

