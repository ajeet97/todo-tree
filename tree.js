/* jshint esversion:6 */

var vscode = require('vscode');
var path = require("path");

var utils = require('./utils.js');
var icons = require('./icons.js');
var config = require('./config.js');
var highlights = require('./highlights.js');

var workspaceFolders;
var nodes = [];

const PATH = "path";
const TODO = "todo";

var buildCounter = 1;
var nodeCounter = 1;

var expandedNodes = {};

var isVisible = function (e) {
	return e.visible === true;
};

var findTagNode = function (node) {
	if (config.isRegexCaseSensitive()) {
		return node.type === PATH && node.tag === this.toString();
	}
	return node.type === PATH && node.tag && node.tag.toLowerCase() === this.toString().toLowerCase();
};

var findAuthorNode = function (node) {
	return node.type === PATH && node.author === this.toString();
}

var findExactPath = function (node) {
	return node.type === PATH && node.fsPath === this.toString();
};

var findPathNode = function (node) {
	return node.type === PATH && node.pathElement === this.toString();
};

var findTodoNode = function (node) {
	return node.label === this.label.toString() && node.line === this.line;
};

var sortByLabelAndLine = function (a, b) {
	return a.label > b.label ? 1 : b.label > a.label ? -1 : a.line > b.line ? 1 : -1;
};

var sortByFilenameAndLine = function (a, b) {
	return a.fsPath > b.fsPath ? 1 : b.fsPath > a.fsPath ? -1 : a.line > b.line ? 1 : -1;
};

var sortByTagAndLine = function (a, b) {
	return a.tag > b.tag ? 1 : b.tag > a.tag ? -1 : a.line > b.line ? 1 : -1;
};

var sortByTagFilenameAndLine = function (a, b) {
	return a.tag > b.tag ? 1 : b.tag > a.tag ? -1 : sortByFilenameAndLine(a, b);
};

function createWorkspaceRootNode(folder) {
	var id = (buildCounter * 1000000) + nodeCounter++;
	return {
		isWorkspaceNode: true,
		type: PATH,
		label: folder.name,
		nodes: [],
		todos: [],
		fsPath: folder.uri.fsPath,
		id: id,
		visible: true
	};
}

function createPathNode(folder, pathElements) {
	var id = (buildCounter * 1000000) + nodeCounter++;
	var fsPath = pathElements.length > 0 ? path.join(folder, pathElements.join(path.sep)) : folder;

	return {
		type: PATH,
		fsPath: fsPath,
		pathElement: pathElements[pathElements.length - 1],
		label: pathElements[pathElements.length - 1],
		nodes: [],
		todos: [],
		id: id,
		visible: true
	};
}

function createFlatNode(fsPath, rootNode) {
	var id = (buildCounter * 1000000) + nodeCounter++;
	var pathLabel = path.dirname(rootNode === undefined ? fsPath : path.relative(rootNode.fsPath, fsPath));

	return {
		type: PATH,
		fsPath: fsPath,
		label: path.basename(fsPath),
		pathLabel: pathLabel === '.' ? '' : '(' + pathLabel + ')',
		nodes: [],
		todos: [],
		id: id,
		visible: true
	};
}

function createTagNode(fsPath, tag) {
	var id = (buildCounter * 1000000) + nodeCounter++;

	return {
		isRootTagNode: true,
		type: PATH,
		label: tag,
		fsPath: tag,
		nodes: [],
		todos: [],
		id: id,
		tag: tag,
		visible: true
	};
}

function createAuthorNode(fsPath, author) {
	var id = (buildCounter * 1000000) + nodeCounter++;

	return {
		isRootAuthorNode: true,
		type: PATH,
		label: author,
		fsPath: author,
		nodes: [],
		todos: [],
		id: id,
		author: author,
		visible: true
	};
}

function createTodoNode(result) {
	var id = (buildCounter * 1000000) + nodeCounter++;
	var text = utils.removeBlockComments(result.match.substr(result.column - 1), result.file);
	var extracted = utils.extractTag(text);
	var label = extracted.withoutTag ? extracted.withoutTag : "line " + result.line;

	if (!config.shouldGroupByTag()) {
		label = extracted.tag + " " + label;
	}

	// if (!config.shouldGroupByAuthor()) {
	// 	label = result.author + ' :: ' + label;
	// }

	return {
		type: TODO,
		fsPath: result.file,
		author: result.author,
		label: label,
		tag: extracted.tag,
		line: result.line - 1,
		column: result.column,
		after: extracted.withoutTag.trim(),
		before: result.match.substring(0, result.column - 1).trim(),
		id: id,
		visible: true
	};
}

function locateWorkspaceNode(nodes, filename) {
	var result;
	nodes.map(function (node) {
		if (node.isWorkspaceNode && filename.indexOf(node.fsPath) === 0) {
			result = node;
		}
	});
	return result;
}

function locateFlatChildNode(rootNode, result, {author, tag}) {
	var parentNodes = (rootNode === undefined ? nodes : rootNode.nodes);
	if (config.shouldGroupByTag() && tag) {
		var parentNode = parentNodes.find(findTagNode, tag);
		if (parentNode === undefined) {
			parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [tag]);
			parentNode.tag = tag;
			parentNodes.push(parentNode);
			parentNodes.sort(sortByFilenameAndLine);
		}
		parentNodes = parentNode.nodes;
	}
	else if (config.shouldGroupByAuthor() && author) {
		var parentNode = parentNodes.find(findAuthorNode, author);
		if (parentNode === undefined) {
			parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [author]);
			parentNode.author = author;
			parentNodes.push(parentNode);
			parentNodes.sort(sortByFilenameAndLine);
		}
		parentNodes = parentNode.nodes;
	}

	var childNode = parentNodes.find(findExactPath, result.file);
	if (childNode === undefined) {
		childNode = createFlatNode(result.file, rootNode);
		parentNodes.push(childNode);
		parentNodes.sort(sortByFilenameAndLine);
	}

	return childNode;
}

function locateTreeChildNode(rootNode, pathElements, {author, tag}) {
	var childNode;

	var parentNodes = rootNode.nodes;

	if (config.shouldGroupByTag() && tag) {
		var parentNode = parentNodes.find(findTagNode, tag);
		if (parentNode === undefined) {
			parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [tag]);
			parentNode.tag = tag;
			parentNodes.push(parentNode);
			parentNodes.sort(sortByLabelAndLine);
		}
		parentNodes = parentNode.nodes;
	}
	else if (config.shouldGroupByAuthor() && author) {
		var parentNode = parentNodes.find(findAuthorNode, author);
		if (parentNode === undefined) {
			parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [author]);
			parentNode.author = author;
			parentNodes.push(parentNode);
			parentNodes.sort(sortByLabelAndLine);
		}
		parentNodes = parentNode.nodes;
	}

	pathElements.map(function (element, level) {
		childNode = parentNodes.find(findPathNode, element);
		if (childNode === undefined) {
			childNode = createPathNode(rootNode.fsPath, pathElements.slice(0, level + 1));
			parentNodes.push(childNode);
			parentNodes.sort(sortByLabelAndLine);
			parentNodes = childNode.nodes;
		}
		else {
			parentNodes = childNode.nodes;
		}
	});

	return childNode;
}

function countTags(child, tagCounts) {
	if (child.nodes !== undefined) {
		countChildTags(child.nodes, tagCounts);
	}
	if (child.todos) {
		child.todos.map(function (todo) {
			tagCounts[todo.tag] = tagCounts[todo.tag] === undefined ? 1 : tagCounts[todo.tag] + 1;
		});
	}
}

function countChildTags(children, tagCounts) {
	children.map(function (child) { return countTags(child, tagCounts); });
	return tagCounts;
}

function addWorkspaceFolders() {
	if (workspaceFolders && config.shouldShowTagsOnly() === false) {
		workspaceFolders.map(function (folder) {
			nodes.push(createWorkspaceRootNode(folder));
		});
	}
}

class TreeNodeProvider {
	constructor(_context) {
		this._context = _context;

		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;

		buildCounter = _context.workspaceState.get('buildCounter', 1);
		expandedNodes = _context.workspaceState.get('expandedNodes', {});
	}

	getChildren(node) {
		if (node === undefined) {
			var availableNodes = nodes.filter(function (node) {
				return node.nodes === undefined || (node.nodes.length + node.todos.length > 0);
			});
			var rootNodes = availableNodes.filter(isVisible);
			if (rootNodes.length > 0) {
				if (config.shouldGroupByTag()) {
					rootNodes.sort(function (a, b) {
						return a.name > b.name;
					});
				}
				return rootNodes;
			}

			return [{ label: "Nothing found", empty: availableNodes.length === 0 }];
		}
		else if (node.type === PATH) {
			if (node.nodes && node.nodes.length > 0) {
				return node.nodes.filter(isVisible);
			}
			else {
				return node.todos.filter(isVisible);
			}
		}
		else if (node.type === TODO) {
			return node.text;
		}
	}

	getParent(node) {
		return node.parent;
	}

	async getTreeItem(node) {
		var treeItem;
		try {
			treeItem = new vscode.TreeItem(node.label + (node.pathLabel ? (" " + node.pathLabel) : ""));
		}
		catch (e) {
			console.log("Failed to create tree item: " + e);
		}

		treeItem.id = node.id;
		treeItem.fsPath = node.fsPath;

		treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

		if (node.fsPath) {
			treeItem.node = node;
			if (config.showBadges() && !node.tag) {
				treeItem.resourceUri = vscode.Uri.file(node.fsPath);
			}

			treeItem.tooltip = node.fsPath;
			if (node.line !== undefined) {
				treeItem.tooltip += ", line " + (node.line + 1);
				if (config.shouldShowLineNumbers()) {
					treeItem.label = "Line " + (node.line + 1) + ":" + treeItem.label;
				}
			}

			if (node.type === PATH) {
				if (expandedNodes[node.fsPath] !== undefined) {
					treeItem.collapsibleState = (expandedNodes[node.fsPath] === true) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
				}
				else {
					treeItem.collapsibleState = config.shouldExpand() ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
				}

				if (node.isWorkspaceNode || node.tag) {
					treeItem.iconPath = icons.getIcon(this._context, node.tag ? node.tag : node.label);
				}
				else if (node.nodes && node.nodes.length > 0) {
					treeItem.iconPath = vscode.ThemeIcon.Folder;
				}
				else {
					treeItem.iconPath = vscode.ThemeIcon.File;
				}
			}
			else if (node.type === TODO) {
				treeItem.iconPath = icons.getIcon(this._context, node.tag ? node.tag : node.label);
				var format = config.labelFormat();
				if (format !== "") {
					treeItem.label = utils.formatLabel(format, node) + (node.pathLabel ? (" " + node.pathLabel) : "");
				}

				treeItem.command = {
					command: "todo-tree.revealTodo",
					title: "",
					arguments: [
						node.fsPath,
						node.line
					]
				};
			}
		}

		if (config.shouldShowCounts() && node.type === PATH) {
			var tagCounts = {};
			countTags(node, tagCounts);
			var total = Object.values(tagCounts).reduce(function (a, b) { return a + b; }, 0);
			treeItem.description = total.toString();
		}

		return treeItem;
	}

	clear(folders) {
		nodes = [];

		workspaceFolders = folders;

		addWorkspaceFolders();
	}

	rebuild() {
		buildCounter = (buildCounter + 1) % 100;
	}

	refresh() {
		if (config.shouldShowTagsOnly()) {
			let sortBy = sortByFilenameAndLine;
			if (config.shouldGroupByTag()) sortBy = sortByTagAndLine;
			else if (config.shouldGroupByAuthor() || config.shouldSortTagsOnlyViewAlphabetically()) sortBy = sortByLabelAndLine;

			nodes.sort(sortBy);

			sortBy = sortByFilenameAndLine;
			if (config.shouldGroupByAuthor()) sortBy = sortByTagFilenameAndLine;
			else if (config.shouldSortTagsOnlyViewAlphabetically()) sortBy = sortByLabelAndLine;

			nodes.forEach(function (node) {
				if (node.todos) node.todos.sort(sortBy);
			});
		}

		this._onDidChangeTreeData.fire();
	}

	filter(text, children) {
		var matcher = new RegExp(text, config.showFilterCaseSensitive() ? "" : "i");

		if (children === undefined) {
			children = nodes;
		}
		children.forEach(child => {
			if (child.type === TODO) {
				var match = matcher.test(child.label);
				child.visible = !text || match;
			}
			else {
				if (child.nodes !== undefined) {
					this.filter(text, child.nodes);
				}
				if (child.todos !== undefined) {
					this.filter(text, child.todos);
				}
				var visibleNodes = child.nodes ? child.nodes.filter(isVisible).length : 0;
				var visibleTodos = child.todos ? child.todos.filter(isVisible).length : 0;
				child.visible = visibleNodes + visibleTodos > 0;
			}
		});
	}

	clearFilter(children) {
		if (children === undefined) {
			children = nodes;
		}
		children.forEach(function (child) {
			child.visible = true;
			if (child.nodes !== undefined) {
				this.clearFilter(child.nodes);
			}
			if (child.todos !== undefined) {
				this.clearFilter(child.todos);
			}
		}, this);
	}

	add(result) {
		if (nodes.length === 0) {
			addWorkspaceFolders();
		}

		var rootNode = locateWorkspaceNode(nodes, result.file);
		var todoNode = createTodoNode(result);

		if (highlights.shouldHideFromTree(todoNode.tag)) {
			return;
		}

		var childNode;
		if (config.shouldShowTagsOnly()) {
			if (config.shouldGroupByTag()) {
				if (todoNode.tag) {
					childNode = nodes.find(findTagNode, todoNode.tag);
					if (childNode === undefined) {
						childNode = createTagNode(result.file, todoNode.tag);
						nodes.push(childNode);
					}
				}
				else if (nodes.find(findTodoNode, todoNode) === undefined) {
					nodes.push(todoNode);
				}
			}
			else if (config.shouldGroupByAuthor()) {
				if (todoNode.author) {
					childNode = nodes.find(findAuthorNode, todoNode.author);
					if (childNode === undefined) {
						childNode = createAuthorNode(result.file, todoNode.author);
						nodes.push(childNode);
					}
				}
				else if (nodes.find(findTodoNode, todoNode) === undefined) {
					nodes.push(todoNode);
				}
			}
			else {
				if (nodes.find(findTodoNode, todoNode) === undefined) {
					nodes.push(todoNode);
				}
			}
		}
		else if (config.shouldFlatten() || rootNode === undefined) {
			childNode = locateFlatChildNode(rootNode, result, todoNode);
		}
		else if (rootNode) {
			var relativePath = path.relative(rootNode.fsPath, result.file);
			var pathElements = [];
			if (relativePath !== "") {
				pathElements = relativePath.split(path.sep);
			}
			childNode = locateTreeChildNode(rootNode, pathElements, todoNode);
		}

		if (childNode) {
			if (childNode.todos === undefined) {
				childNode.todos = [];
			}

			childNode.expanded = result.expanded;

			if (childNode.todos.find(findTodoNode, todoNode) === undefined) {
				todoNode.parent = childNode;
				childNode.todos.push(todoNode);
				childNode.showCount = true;
			}
		}
	}

	reset(filename, children) {
		var root = children === undefined;
		if (children === undefined) {
			children = nodes;
		}
		children = children.filter(function (child) {
			var keep = true;
			if (child.nodes !== undefined) {
				this.reset(filename, child.nodes);
			}
			if (child.type === TODO && !child.tag && child.fsPath == filename) // no tag (e.g. markdown)
			{
				keep = false;
			}
			else if (child.type === TODO && child.parent === undefined && child.fsPath == filename) // top level todo node
			{
				keep = false;
			}
			else if (child.fsPath === filename || child.isRootTagNode || child.isRootAuthorNode) {
				if (config.shouldShowTagsOnly()) {
					if (child.todos) {
						child.todos = child.todos.filter(function (todo) {
							return todo.fsPath !== filename;
						});
					}
				}
				else {
					child.todos = [];
				}
			}
			return keep;
		}, this);

		if (root) {
			nodes = children;
		}
	}

	remove(filename, children) {
		function removeNodesByFilename(children, me) {
			return children.filter(function (child) {
				if (child.nodes !== undefined) {
					child.nodes = me.remove(filename, child.nodes);
				}
				var shouldRemove = (child.fsPath === filename);
				if (shouldRemove) {
					delete expandedNodes[child.fsPath];
					me._context.workspaceState.update('expandedNodes', expandedNodes);
				}
				return shouldRemove === false;
			}, me);
		}

		function removeEmptyNodes(children, me) {
			return children.filter(function (child) {
				if (child.nodes !== undefined) {
					child.nodes = me.remove(filename, child.nodes);
				}
				var shouldRemove = (child.nodes && child.todos && child.nodes.length + child.todos.length === 0 && child.isWorkspaceNode !== true);
				if (shouldRemove) {
					delete expandedNodes[child.fsPath];
					me._context.workspaceState.update('expandedNodes', expandedNodes);
				}
				return shouldRemove !== true;
			}, me);
		}

		var root = children === undefined;
		if (children === undefined) {
			children = nodes;
		}

		children = removeNodesByFilename(children, this);
		children = removeEmptyNodes(children, this);

		if (root) {
			nodes = children;
		}

		return children;
	}

	getElement(filename, found, children) {
		if (children === undefined) {
			children = nodes;
		}
		children.forEach(function (child) {
			if (child.fsPath === filename) {
				found(child);
			}
			else if (child.nodes !== undefined) {
				return this.getElement(filename, found, child.nodes);
			}
		}, this);
	}

	setExpanded(path, expanded) {
		expandedNodes[path] = expanded;
		this._context.workspaceState.update('expandedNodes', expandedNodes);
	}

	clearExpansionState() {
		expandedNodes = {};
		this._context.workspaceState.update('expandedNodes', expandedNodes);
	}

	getTagCounts() {
		var tagCounts = {};
		return countChildTags(nodes, tagCounts);
	}
}

exports.TreeNodeProvider = TreeNodeProvider;
