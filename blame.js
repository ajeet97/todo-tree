const {exec} = require('child_process');

const cache = {
	_cache: {},
	get(key, defaultValue) {
		if (!key) return this._cache;

		const keys = key.split('.');
		let result = this._cache;
		try {
			for (const i in keys) result = result[keys[i]];
		}
		catch(e) {
			result = undefined;
		}
		
		if (result === undefined) return defaultValue;
		return result;
	},

	set(key, value) {
		if (!key) return;

		const keys = key.split('.');
		const len = keys.length;

		let cc = this._cache;
		for (const i in keys) {
			const k = keys[i];
			if (i == len - 1) cc[k] = value;
			else if (!cc[k]) cc[k] = {};
			cc = cc[k];
		}
	},

	del(key) {
		if (!key) {
			this._cache = {};
			return;
		}
		this.set(key, undefined);
	},
};
let initializing;

function init(rootFolders) {
	const asyncTask = async () => {
		cache.del(); // TODO: delete whole cache?

		const promises = [];
		rootFolders.forEach((folder) => {
			const fsPath = folder.uri.fsPath || '.';
			promises.push(new Promise((resolve) => {
				exec('git config user.email', {cwd: fsPath}, (err, stdout) => {
					let user = stdout || '';
					if (err) {
						console.error(err);
						user = 'unknown';
					}

					cache.set(`__current-git-user__.${fsPath}`, user.replace('\n', ''));
					resolve();
				})
			}));
		});

		await Promise.all(promises);
	}
	initializing = asyncTask();
}

function deleteFileCache(file) {
	cache.del(file.replace('.', '___'));
}

function isAinB(dirA, dirB) {
	const pathA = dirA.split('/');
	const pathB = dirB.split('/');

	if (pathB.length > pathA.length) return false;

	for (let i = 0; i < pathB.length; i++) {
		if (pathB[i] !== pathA[i]) return false;
	}

	return true;
}

function getCurrentGitUser(dir) {
	const currentUsers = cache.get('__current-git-user__');
	for (const path in currentUsers) {
		if (isAinB(dir, path)) {
			return currentUsers[path];
		}
	}
	return 'unknown';
}

function getFileDir(file) {
	if (!file) return '.';
	const index = file.lastIndexOf('/');
	return file.slice(0, index) || '.';
}

async function getAuthor(file, line) {
	await initializing;

	const key = `${file.replace('.', '___')}.${line}`;
	const fileDir = getFileDir(file);

	const cached = cache.get(key);
	if (cached) return cached;

	const currentUser = getCurrentGitUser(fileDir);
	return new Promise((resolve) => {
		exec(`git blame ${file} -L ${line},+1 -e -w -M -C -c | cut -f 2`, {cwd: fileDir}, (err, stdout) => {
			if (err) {
				console.error(err);
				resolve('unknown');
				return;
			}

			let author = stdout;
			author = author.slice(2, author.length - 2);
			if (['not.committed.yet', currentUser].includes(author)) {
				author = `(You) ${currentUser}`;
			}
			cache.set(key, author);

			resolve(author);
		});
	});
}

module.exports.init = init;
module.exports.deleteFileCache = deleteFileCache;
module.exports.getAuthor = getAuthor;