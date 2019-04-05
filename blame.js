const {exec} = require('child_process');

const cache = {};

function getFileDir(file) {
	const index = file.lastIndexOf('/');
	return file.slice(0, index) || '.';
}

async function getAuthor(file, line) {
	// console.log(`running command: git blame ${file} -L ${line + 1},+1 -e -w -M`);
	const fileDir = getFileDir(file);
	return new Promise((resolve) => {
		const cached = cache[file + line];
		if (cached) {
			resolve(cached);
		} 
		else {
			exec(`git blame ${file} -L ${line},+1 -e -w -M`, {cwd: fileDir}, (err, stdout) => {
				if (err) {
					console.error(err);
					resolve('unknown');
					return;
				}

				const match = stdout.match(/.*<(.+@.+)>.*/,);
				const result = (match && match[1]) || 'unknown';

				cache[file + line] = result;

				resolve(result);
			});
		}
	});
}

module.exports.getAuthor = getAuthor;