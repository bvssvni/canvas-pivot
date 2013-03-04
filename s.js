var shape_type = {circle: 1, line: 2};
var editor = {selected_frame: null, workarea_mousedown_pos: null, workarea_mousemove_pos: null, workarea_is_mousedown: false, workarea_mouseup_pos: null, closest_pivot_info: null, workarea_is_shiftdown: false, workarea_key: null, thickness: 15};
var gui = {workarea_id: "workarea", thickness_id: "thickness"};
var settings = {pivot_color: "#FF0000", pivot_rigid_color: "#8888FF", pivot_locked_color: "#888888", pivot_radius: 7, closest_pivot_color: "#FFFF00", closest_pivot_color_added_shape: "#00FF00", closest_pivot_radius: 5, simulate_iterations: 10};

// LZW-compress a string
function lzw_encode(s) {
    "use strict";
    var dict = {};
    var data = (s + "").split("");
    var out = [];
    var currChar;
    var phrase = data[0];
    var code = 256;
    for (var i=1; i<data.length; i++) {
        currChar=data[i];
        if (dict[phrase + currChar] != null) {
            phrase += currChar;
        }
        else {
            out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
            dict[phrase + currChar] = code;
            code++;
            phrase=currChar;
        }
    }
    out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
    for (var i=0; i<out.length; i++) {
        out[i] = String.fromCharCode(out[i]);
    }
    return out.join("");
}

// Decompress an LZW-encoded string
function lzw_decode(s) {
    var dict = {};
    var data = (s + "").split("");
    var currChar = data[0];
    var oldPhrase = currChar;
    var out = [currChar];
    var code = 256;
    var phrase;
    for (var i=1; i<data.length; i++) {
        var currCode = data[i].charCodeAt(0);
        if (currCode < 256) {
            phrase = data[i];
        }
        else {
			phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
        }
        out.push(phrase);
        currChar = phrase.charAt(0);
        dict[code] = oldPhrase + currChar;
        code++;
        oldPhrase = phrase;
    }
    return out.join("");
}

function ellipse(context, style, x, y, w, h) {
	if (style == null) throw "Missing argument \"style\"";
	if (x == null) throw "Missing argument \"x\"";
	if (y == null) throw "Missing argument \"y\"";
	if (w == null) throw "Missing argument \"w\"";
	if (h == null) throw "Missing argument \"h\"";
	
	var kappa = .5522848;
	var ox = (w / 2) * kappa, // control point offset horizontal
	oy = (h / 2) * kappa, // control point offset vertical
	xe = x + w, // x-end
	ye = y + h, // y-end
	xm = x + w / 2, // x-middle
	ym = y + h / 2; // y-middle
	
	context.beginPath();
	context.moveTo(x, ym);
	context.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
	context.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
	context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
	context.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
	context.closePath();
	if (style == "line") context.stroke();
	if (style == "fill") context.fill();
}

function line(context, x1, y1, x2, y2) {
	if (x1 == null) throw "Missing argument \"x1\"";
	if (y1 == null) throw "Missing argument \"y1\"";
	if (x2 == null) throw "Missing argument \"x2\"";
	if (y2 == null) throw "Missing argument \"y2\"";
	
	context.beginPath();
	context.moveTo(x1, y1);
	context.lineTo(x2, y2);
	context.stroke();
}

function mousePos(canvas, event) {
	var rect = canvas.getBoundingClientRect();
	return [event.clientX - rect.left, event.clientY - rect.top];
}

function newFrame() {
	var pivots = [];
	var locks = [];
	var rigids = [];
	var shapes = [];
	// Contains the information for rigid body simulation.
	var rigid_lists = [];
	var rigid_positions = [];
	var frame = {};
	
	var updateRigids = function() {
		var lists = [];
		// Create empty lists.
		for (var i = 0; i < pivots.length; i++) {
			lists.push([]);
		}
		// Create a list of all rigid pivots and their connected pivots.
		for (var i = 0; i < shapes.length; i++) {
			var shape = shapes[i];
			var p1 = shape.p1;
			var p2 = shape.p2;
			var p1rigid = rigids[p1];
			var p2rigid = rigids[p2];
			if (p1rigid) {
				var list = lists[p1];
				if (list.length == 0) {
					list.push(p1);
				}
				
				list.insertSorted(p2);
			}
			if (p2rigid) {
				var list = lists[p2];
				if (list.length == 0) {
					list.push(p2);
				}
				
				list.insertSorted(p1);
			}
		}
		
		// Remove empty lists.
		for (var i = lists.length - 1; i >= 0; i--) {
			if (lists[i].length == 0) {
				lists.splice(i, 1);
			}
		}
		
		// Connect lists that are joined by rigid pivot.
		var restart = false;
		do {
			restart = false;
			for (var i = 0; i < lists.length; i++) {
				var a = lists[i];
				for (var j = i+1; j < lists.length; j++) {
					var b = lists[j];
					var c = a.and(b);
					if (c.length == 0) continue;
					
					var foundRigid = false;
					for (var k = 0; k < c.length; k++) {
						if (rigids[c[k]]) {
							foundRigid = true;
							break;
						}
					}
					
					if (!foundRigid) continue;
					
					restart = true;
					lists[i] = a.or(b);
					lists.splice(j, 1);
					break;
				}
				
				if (restart) break;
			}
		} while (restart);
		
		// Push the start positions to update the rigids.
		rigid_lists = lists;
		rigid_positions = [];
		for (var i = 0; i < rigid_lists.length; i++) {
			var list = rigid_lists[i];
			var poslist = [];
			for (var j = 0; j < list.length; j++) {
				var p = pivots[list[j]];
				poslist.push([p[0], p[1]]);
			}
			
			rigid_positions.push(poslist);
		}
	}
	
	frame.addPivot = function(x, y) {
		pivots.push([x, y]);
		locks.push(false);
		rigids.push(false);
		return pivots.length - 1;
	}
	frame.getPivotPosition = function(id) {
		return pivots[id];
	}
	frame.setPivotPosition = function(id, x, y) {
		pivots[id] = [x, y];
	}
	frame.getPivotRigid = function(p) {
		return rigids[p];
	}
	frame.setPivotRigid = function(p, val) {
		rigids[p] = val;
		updateRigids();
	}
	frame.getPivotLocked = function(p) {
		return locks[p];
	}
	frame.setPivotLocked = function(p, val) {
		locks[p] = val;
	}
	
	var distanceBetweenPoints = function(p1, p2) {
		var pos1 = pivots[p1];
		var pos2 = pivots[p2];
		var dx = pos2[0] - pos1[0];
		var dy = pos2[1] - pos1[1];
		var d = Math.sqrt(dx * dx + dy * dy);
		return d;
	}
	
	frame.addCircle = function(p1, p2, color) {
		var dist = distanceBetweenPoints(p1, p2);
		shapes.push({type:shape_type.circle, p1:p1, p2:p2, color:color,
					distance: dist});
		return shapes.length - 1;
	}
	
	frame.addLine = function(p1, p2, color, thickness) {
		var dist = distanceBetweenPoints(p1, p2);
		shapes.push({type:shape_type.line, p1:p1, p2:p2, color:color,
					thickness:thickness,
					distance: dist});
		return shapes.length - 1;
	}
	
	frame.updateDistance = function(p) {
		for (var i = 0; i < shapes.length; i++) {
			var shape = shapes[i];
			if (shape.p1 == p || shape.p2 == p) {
				var dist = distanceBetweenPoints(shape.p1, shape.p2);
				shape.distance = dist;
			}
		}
		
		updateRigids();
	}
	
	frame.deletePivot = function(p) {
		for (var i = shapes.length - 1; i >= 0; i--) {
			var shape = shapes[i];
			if (shape.p1 == p || shape.p2 == p) {
				shapes.splice(i, 1);
			}
		}
		
		pivots.splice(p, 1);
		locks.splice(p, 1);
		rigids.splice(p, 1);
		
		for (var i = 0; i < shapes.length; i++) {
			var shape = shapes[i];
			if (shape.p1 > p) shape.p1--;
			if (shape.p2 > p) shape.p2--;
		}
	}
	
	frame.draw = function(context) {
		context.save();
		for (var i = 0; i < shapes.length; i++) {
			var shape = shapes[i];
			var p1 = pivots[shape.p1];
			var p2 = pivots[shape.p2];
			if (shape.type == shape_type.circle) {
				var cx = 0.5 * p1[0] + 0.5 * p2[0];
				var cy = 0.5 * p1[1] + 0.5 * p2[1];
				var dx = p2[0] - p1[0];
				var dy = p2[1] - p1[1];
				var d = Math.sqrt(dx * dx + dy * dy);
				context.fillStyle = shape.color;
				
				
				ellipse(context, "fill", cx - 0.5 * d, cy - 0.5 * d, d, d);
			}
			if (shape.type == shape_type.line) {
				context.strokeStyle = shape.color;
				context.lineWidth = shape.thickness;
				context.lineCap = "round";
				line(context, p1[0], p1[1], p2[0], p2[1]);
			}
		}
		
		context.restore();
	}
	
	frame.drawPivots = function(context) {
		context.save();
		for (var i = 0; i < pivots.length; i++) {
			var p = pivots[i];
			var r = settings.pivot_radius;
			if (locks[i]) {
				context.fillStyle = settings.pivot_locked_color;
			} else if (rigids[i]) {
				context.fillStyle = settings.pivot_rigid_color;
			} else {
				context.fillStyle = settings.pivot_color;
			}
			ellipse(context, "fill", p[0] - r, p[1] - r, 2*r, 2*r);
		}
		context.restore();
	}
	
	frame.closestPivotInfo = function(x, y) {
		if (x == null) throw "Missing argument \"x\"";
		if (y == null) throw "Missing argument \"y\"";
		
		var min_dist = -1;
		var min_index = -1;
		for (var i = pivots.length - 1; i >= 0; i--) {
			var p = pivots[i];
			var dx = p[0] - x;
			var dy = p[1] - y;
			var d = Math.sqrt(dx * dx + dy * dy);
			if (min_dist == -1 || d < min_dist) {
				min_dist = d;
				min_index = i;
			}
		}
		
		return {min_index: min_index, min_distance: min_dist,
			pos: min_index == -1 ? null : pivots[min_index]};
	}
	
	var simulateRigids = function() {
		for (var i = 0; i < rigid_lists.length; i++) {
			var oldx = 0.0;
			var oldy = 0.0;
			var newx = 0.0;
			var newy = 0.0;
			var list = rigid_lists[i];
			
			var n = list.length;
			for (var j = 0; j < n; j++) {
				var p = pivots[list[j]];
				var q = rigid_positions[i][j];
				
				oldx += q[0];
				oldy += q[1];
				newx += p[0];
				newy += p[1];
			}
			
			oldx /= n;
			oldy /= n;
			newx /= n;
			newy /= n;
			var cross = 0.0;
			var dot = 0.0;
			for (var j = 0; j < n; j++) {
				var p = pivots[list[j]];
				var q = rigid_positions[i][j];
				var old_dx = q[0] - oldx;
				var old_dy = q[1] - oldy;
				var new_dx = p[0] - newx;
				var new_dy = p[1] - newy;
				dot += old_dx * new_dx + old_dy * new_dy;
				cross += old_dx * new_dy - old_dy * new_dx;
			}
			
			var distance = Math.sqrt(dot * dot + cross * cross);
			if (Math.abs(distance) < 0.00000001) return;
			
			dot /= distance;
			cross /= distance;
			
			for (var j = 0; j < n; j++) {
				var q = rigid_positions[i][j];
				var dx = q[0] - oldx;
				var dy = q[1] - oldy;
				var px = dot * dx - cross * dy + newx;
				var py = cross * dx + dot * dy + newy;
				var ind = list[j];
				var locked = locks[ind];
				if (!locked) {pivots[ind] = [px, py];}
			}
		}
	}
	
	frame.simulate = function() {
		simulateRigids();
		
		for (var i = 0; i < shapes.length; i++) {
			var shape = shapes[i];
			if (rigids[shape.p1] || rigids[shape.p2]) continue;
			if (locks[shape.p1] && locks[shape.p2]) continue;
			
			var distance = shape.distance;
			var p1 = pivots[shape.p1];
			var p2 = pivots[shape.p2];
			var dx = p2[0] - p1[0];
			var dy = p2[1] - p1[1];
			var d = Math.sqrt(dx * dx + dy * dy);
			if (d < 0.0000001) continue;
			
			var diff = distance - d;
			dx *= 0.5 * diff / d;
			dy *= 0.5 * diff / d;
			if (locks[shape.p1]) {
				pivots[shape.p2] = [p2[0] + 2*dx, p2[1] + 2*dy];
			} else if (locks[shape.p2]) {
				pivots[shape.p1] = [p1[0] - 2*dx, p1[1] - 2*dy];
			} else {
				pivots[shape.p1] = [p1[0] - dx, p1[1] - dy];
				pivots[shape.p2] = [p2[0] + dx, p2[1] + dy];
			}
		}
	}
	
	frame.getData = function() {
		var str = "";
		str += pivots.length + ",";
		for (var i = 0; i < pivots.length; i++) {
			var p = pivots[i];
			var x = Math.round(p[0]*10);
			var y = Math.round(p[1]*10);
			str += x + "," + y + "," + (rigids[i]?1:0) + "," + (locks[i]?1:0) + ",";
		}
		
		str += shapes.length + ",";
		for (var i = 0; i < shapes.length; i++) {
			var shape = shapes[i];
			str += shape.type + "," + shape.p1 + "," + shape.p2 + ",";
			if (shape.type == shape_type.line) {
				str += Math.round(shape.thickness * 10) + ",";
			}
		}
		return str;
	}
	frame.setData = function(valStr) {
		var vals = valStr.split(",");
		var cur = 0;
		var pivot_length = parseInt(vals[cur++]);
		for (var i = 0; i < pivot_length; i++) {
			var x = parseInt(vals[cur++])/10;
			var y = parseInt(vals[cur++])/10;
			var rigid = parseInt(vals[cur++]);
			var locked = parseInt(vals[cur++]);
			pivots.push([x, y]);
			rigids.push(rigid == 0 ? false : true);
			locks.push(locked == 0 ? false : true);
		}
		
		var shape_length = parseInt(cur++);
		for (var i = 0; i < shape_length; i++) {
			var type = parseInt(vals[cur++]);
			var p1 = parseInt(vals[cur++]);
			var p2 = parseInt(vals[cur++]);
			var color = "#000000";
			if (type == shape_type.circle) {
				frame.addCircle(p1, p2, color);
			} else if (type == shape_type.line) {
				var thickness = parseInt(vals[cur++]);
				frame.addLine(p1, p2, color, thickness/10);
			}
		}
		
		frame.updateDistance();
	}
	
	return frame;
}

function testFrame() {
	var frame = newFrame();
	
	var addSeparateCircle = function(x1, y1, x2, y2) {
		var p1 = frame.addPivot(x1, y1);
		var p2 = frame.addPivot(x2, y2);
		frame.addCircle(p1, p2, "#000000");
	}
	
	var addSeparateLine = function(x1, y1, x2, y2) {
		var p1 = frame.addPivot(x1, y1);
		var p2 = frame.addPivot(x2, y2);
		frame.addLine(p1, p2, "#000000", 15);
	}
	
	addSeparateCircle(10, 10, 20, 20);
	addSeparateCircle(100, 100, 120, 120);
	addSeparateLine(50, 50, 50, 150);
	
	return frame;
}

function defaultFrame() {
	var frame = newFrame();
	var box = document.getElementById(gui.workarea_id);
	frame.addPivot(0.5 * box.width, 0.5 * box.height);
	return frame;
}

function isDragging(advisor) {
	return advisor.move_pivot && editor.workarea_is_mousedown;
}

function shouldSimulate(advisor) {
	if (editor.workarea_is_shiftdown) return false;
	if (editor.added_shape) return false;
	
	return isDragging(advisor);
}

function shouldUpdateDistance(advisor) {
	if (editor.added_shape) return true;
	
	return isDragging(advisor) && editor.workarea_is_shiftdown;
}

function shouldRefreshGraphics(advisor) {
	return advisor.loading ||
	advisor.move_pivot ||
	shouldAddCircle(advisor) ||
	shouldAddLine(advisor) ||
	advisor.workarea_keyup;
}

function shouldRenderSelectedFrame(advisor) {
	return shouldRefreshGraphics(advisor);
}

function shouldRenderSelectedFramePivots(advisor) {
	if (editor.workarea_is_mousedown && !editor.workarea_is_shiftdown) {
		return false;
	}
	
	return shouldRefreshGraphics(advisor);
}

function shouldRenderClosestPivot(advisor) {
	if (editor.workarea_is_mousedown && !editor.workarea_is_shiftdown) {
		return false;
	}
	if (editor.closest_pivot_info == null) return false;
	
	return shouldRefreshGraphics(advisor) && !editor.added_shape;
}

function shouldRenderClosestPivotAddedShape(advisor) {
	if (editor.closest_pivot_info == null) return false;
	
	return shouldRefreshGraphics(advisor) && editor.added_shape;
}

function shouldCreateContext(advisor) {
	return shouldRefreshGraphics(advisor);
}

function shouldFindClosestPivotMouseDown(advisor) {
	return advisor.move_pivot && advisor.workarea_mousedown;
}

function shouldFindClosestPivotMouseMove(advisor) {
	if (editor.workarea_is_mousedown) return false;
	if (editor.added_shape) return false;
	
	return advisor.workarea_mousemove;
}

function shouldFindClosestPivotAddedShape(advisor) {
	return shouldAddCircle(advisor) || shouldAddLine(advisor);
}

function shouldChangeWorkareaCursorToCrosshair(advisor) {
	if (editor.workarea_is_mousedown && !editor.workarea_is_shiftdown) {
		return false;
	}
	
	return isDragging(advisor) || editor.added_shape;
}

function shouldChangeWorkareaCursorToNone(advisor) {
	if (editor.workarea_is_shiftdown) return false;
	
	return editor.workarea_is_mousedown;
}

function shouldChangeWorkareaCursorToDefault(advisor) {
	return advisor.workarea_mouseup;
}

function shouldMoveClosestPivot(advisor) {
	if (editor.closest_pivot_info === null) return false;
	
	return editor.added_shape ||
	advisor.move_pivot && editor.workarea_is_mousedown;
}

function shouldSetAddedShapeToFalse(advisor) {
	return advisor.workarea_enter || advisor.workarea_backspace;
}

function shouldSetWorkAreaIsMouseDownToTrue(advisor) {
	return advisor.workarea_mousedown;
}

function shouldSetWorkAreaIsMouseDownToFalse(advisor) {
	return advisor.workarea_mouseup;
}

function shouldAddCircle(advisor) {
	return advisor.workarea_keydown && editor.workarea_key == "E";
}

function shouldAddLine(advisor) {
	return advisor.workarea_keydown && editor.workarea_key == "Q";
}

function shouldTogglePivotRigid(advisor) {
	if (editor.closest_pivot_info === null) return false;
	
	return advisor.workarea_keydown && editor.workarea_key == "S";
}
								
function shouldTogglePivotLocked(advisor) {
	if (editor.closest_pivot_info == null) return false;
	
	return advisor.workarea_keydown && editor.workarea_key == "D";
}

function shouldDeletePivot(advisor) {
	if (editor.closest_pivot_info === null) return false;
	
	return advisor.workarea_keydown && editor.workarea_key == "X" ||
	editor.added_shape && advisor.workarea_backspace;
}

function drawClosestPivot(context, color) {
	var pivot_id = editor.closest_pivot_info.min_index;
	var frame = editor.selected_frame;
	var pos = frame.getPivotPosition(pivot_id);
	context.fillStyle = color;
	var rad = settings.closest_pivot_radius;
	ellipse(context, "fill", pos[0] - rad, pos[1] - rad, 2 * rad, 2 * rad);
}

function doStuff(advisor) {
	var context = null;
	
	if (shouldSetWorkAreaIsMouseDownToTrue(advisor)) {
		editor.workarea_is_mousedown = true;
	}
	if (shouldSetWorkAreaIsMouseDownToFalse(advisor)) {
		editor.workarea_is_mousedown = false;
	}
	if (shouldChangeWorkareaCursorToCrosshair(advisor)) {
		var box = document.getElementById(gui.workarea_id);
		box.style.cursor = "crosshair";
	}
	if (shouldChangeWorkareaCursorToDefault(advisor)) {
		var box = document.getElementById(gui.workarea_id);
		box.style.cursor = "default";
	}
	if (shouldChangeWorkareaCursorToNone(advisor)) {
		var box = document.getElementById(gui.workarea_id);
		box.style.cursor = "none";
	}
	if (shouldAddCircle(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var mouse_pos = editor.workarea_mousemove_pos;
		var frame = editor.selected_frame;
		var p2 = frame.addPivot(mouse_pos[0], mouse_pos[1]);
		frame.addCircle(pivot_id, p2, "#000000");
		editor.move_pivot = true;
		editor.added_shape = true;
		editor.workarea_mousedown_pos = mouse_pos;
	}
	if (shouldAddLine(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var mouse_pos = editor.workarea_mousemove_pos;
		var frame = editor.selected_frame;
		var p2 = frame.addPivot(mouse_pos[0], mouse_pos[1]);
		frame.addLine(pivot_id, p2, "#000000", editor.thickness);
		editor.move_pivot = true;
		editor.added_shape = true;
		editor.workarea_mousedown_pos = mouse_pos;
	}
	if (shouldTogglePivotRigid(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var frame = editor.selected_frame;
		var val = !frame.getPivotRigid(pivot_id);
		frame.setPivotRigid(pivot_id, val);
	}
	if (shouldTogglePivotLocked(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var frame = editor.selected_frame;
		var val = !frame.getPivotLocked(pivot_id);
		frame.setPivotLocked(pivot_id, val);
	}
	if (shouldFindClosestPivotMouseDown(advisor)) {
		var frame = editor.selected_frame;
		var pos = editor.workarea_mousedown_pos;
		editor.closest_pivot_info = frame.closestPivotInfo(pos[0], pos[1]);
	}
	if (shouldFindClosestPivotMouseMove(advisor)) {
		var frame = editor.selected_frame;
		var pos = editor.workarea_mousemove_pos;
		editor.closest_pivot_info = frame.closestPivotInfo(pos[0], pos[1]);
	}
	if (shouldFindClosestPivotAddedShape(advisor)) {
		var frame = editor.selected_frame;
		var pos = editor.workarea_mousemove_pos;
		editor.closest_pivot_info = frame.closestPivotInfo(pos[0], pos[1]);
	}
	if (shouldMoveClosestPivot(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var start_pos = editor.closest_pivot_info.pos;
		var dx = editor.workarea_mousemove_pos[0] -
		editor.workarea_mousedown_pos[0];
		var dy = editor.workarea_mousemove_pos[1] -
		editor.workarea_mousedown_pos[1];
		var frame = editor.selected_frame;
		var new_x = start_pos[0] + dx;
		var new_y = start_pos[1] + dy;
		frame.setPivotPosition(pivot_id, new_x, new_y);
	}
	if (shouldDeletePivot(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var frame = editor.selected_frame;
		frame.deletePivot(pivot_id);
		editor.closest_pivot_info = null;
	}
	if (shouldSetAddedShapeToFalse(advisor)) {
		editor.added_shape = false;
	}
	if (shouldUpdateDistance(advisor)) {
		var pivot_id = editor.closest_pivot_info.min_index;
		var frame = editor.selected_frame;
		frame.updateDistance(pivot_id);
	}
	if (shouldSimulate(advisor)) {
		var frame = editor.selected_frame;
		for (var i = 0; i < settings.simulate_iterations; i++) {
			frame.simulate();
		}
	}
	if (shouldCreateContext(advisor)) {
		var box = document.getElementById(gui.workarea_id);
		context = box.getContext("2d");
		context.clearRect(0, 0, box.width, box.height);
	}
	if (shouldRenderSelectedFrame(advisor)) {
		editor.selected_frame.draw(context);
	}
	if (shouldRenderSelectedFramePivots(advisor)) {
		editor.selected_frame.drawPivots(context);
	}
	if (shouldRenderClosestPivot(advisor)) {
		drawClosestPivot(context, settings.closest_pivot_color);
	}
	if (shouldRenderClosestPivotAddedShape(advisor)) {
		drawClosestPivot(context, settings.closest_pivot_color_added_shape);
	}
}

function newAdvisor() {
	return {
	loading: false,
	move_pivot: false,
	workarea_mousedown: false,
	workarea_mousemove: false,
	workarea_mouseup: false,
	workarea_keydown: false,
	workarea_keyup: true,
	workarea_enter: false,
	workarea_backspace: false
	};
}

function makeWorkareaMovePivot() {
	var box = document.getElementById(gui.workarea_id);
	var mousedown = function(event) {
		event = event || window.event;
		
		editor.workarea_mousedown_pos = mousePos(box, event);
		var advisor = newAdvisor();
		advisor.move_pivot = true;
		advisor.workarea_mousedown = true;
		doStuff(advisor);
		return false;
	}
	var mousemove = function(event) {
		event = event || window.event;
		
		editor.workarea_mousemove_pos = mousePos(box, event);
		var advisor = newAdvisor();
		advisor.move_pivot = true;
		advisor.workarea_mousemove = true;
		doStuff(advisor);
		return false;
	}
	var mouseup = function(event) {
		event = event || window.event;
		
		editor.workarea_mouseup_pos = mousePos(box, event);
		var advisor = newAdvisor();
		advisor.move_pivot = true;
		advisor.workarea_mouseup = true;
		doStuff(advisor);
		return false;
	}
	var keydown = function(event) {
		event = event || window.event;
		event.preventDefault();
		
		var key = event.keyCode;
		var is_shift = key == 16;
		editor.workarea_is_shiftdown = is_shift;
		if (key >= 41 && key <= 90) {
			editor.workarea_key = String.fromCharCode(key);
		} else if (!is_shift) {
			editor.workarea_key = null;
		}
		
		var advisor = newAdvisor();
		advisor.workarea_keydown = true;
		advisor.workarea_enter = key == 13;
		advisor.workarea_backspace = key == 8;
		doStuff(advisor);
		
		return false;
	}
	var keyup = function(event) {
		event = event || window.event;
		
		var key = event.keyCode;
		if (key == 16) editor.workarea_is_shiftdown = false;
		if (key >= 41 && key <= 90) {
			editor.workarea_key = null;
		}
		
		var advisor = newAdvisor();
		advisor.workarea_keyup = true;
		doStuff(advisor);
		return false;
	}
	
	box.addEventListener("mousedown", mousedown, true);
	box.addEventListener("mousemove", mousemove, true);
	box.addEventListener("mouseup", mouseup, true);
	box.addEventListener("keydown", keydown, true);
	box.addEventListener("keyup", keyup, true);
}

function onLoad() {
	editor.selected_frame = defaultFrame();
	
	readUrl(window.location.href);
	
	makeWorkareaMovePivot();
	
	var advisor = newAdvisor();
	advisor.loading = true;
	doStuff(advisor);
}

function updateThickness() {
	var thickness = document.getElementById(gui.thickness_id);
	var val = parseFloat(thickness.value);
	if (val > 0) {
		editor.thickness = val;
	}
}

function updateUrl() {
	var data = editor.selected_frame.getData();
	var cmp = lzw_encode(data);
	window.location.href = "?data=" + encodeURIComponent(cmp);
}

function readUrl(str) {
	var index_start = str.indexOf("=");
	if (index_start == -1) return;
	
	editor.selected_frame = newFrame();
	
	var valStr = decodeURIComponent(str.substring(index_start+1));
	valStr = lzw_decode(valStr);
	editor.selected_frame.setData(valStr);
}

function clearUrl() {
	window.location.href = "?";
}

window.addEventListener("load", onLoad, true);

