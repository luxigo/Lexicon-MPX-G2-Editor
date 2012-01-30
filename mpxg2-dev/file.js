/*
    file.js: read files from disk or from data.js
    Copyright (C) 2012 Luc Deschenaux

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var fs=require('fs');
var data=require('data');
this.DEBUG=false;
var self=this;

var file={
	stat: function(path,callback) {
		var _path=path.replace(/^\.\//,'');
		var stats={};
		var err;

		if (callback) {
			try { 
				stats=fs.statSync(path);
	
			} catch(e) {
				err=e;
			}

		} else {
			stats=fs.statSync(path);
		};

		if (err) {
			if (data[_path]) {
				stats={
					isfile: true,
					size:data[_path].length
				};
				err=0; 
			}
		};

		if (callback) {
			callback(err,stats);
		} else {
			return stats;
		}
	},

	readFile: function(path,encoding,callback) {
		if (typeof(encoding)=="function") {
			callback=encoding;
			encoding='utf8';
		};
		//console.log(encoding||'utf8');
		var _path=path.replace(/^\.\//,'');
		var stats;
		var err;

		try {
			stats=fs.statSync(path);

		} catch(e) {
			err=e;
		};

		if (err) {
			var _data=data[_path];
			if (_data==undefined) {
				throw 'File not found: '+path;
			};
			if (self.DEBUG) console.log('reading from cache:',path);
			if (callback) {
				callback(0,encoding!='binary'?_data.toString(encoding):_data);
				return;
			} else {
				return encoding!='binary'?_data.toString(encoding):_data;
			}
		} else  {
			if (self.DEBUG) console.log('reading from disk:',path);
			if (callback) {
				fs.readFile(path,encoding||'utf8',callback);
			} else {
				return fs.readFileSync(path,encoding||'utf8');
			}
		}
	}
};

module.exports=file;
