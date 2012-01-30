/*
    sysex.js: parse sysex messages from MIDI flow 
    Copyright (C) 2011  Luc Deschenaux

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

var sysex_buf;
var sysex_start;
var sysex_len;
var sysex_offset;

  function concat(bufs) {
    var buffer, length = 0, index = 0;

    if (!Array.isArray(bufs)) {
      bufs = Array.prototype.slice.call(arguments);
    };
    for (var i=0, l=bufs.length; i<l; i++) {
      buffer = bufs[i];
      if (!Buffer.isBuffer(buffer)) {
        buffer = bufs[i] = new Buffer(buffer);
      };
      length += buffer.length;
    };
    buffer = new Buffer(length);

    bufs.forEach(function (buf, i) {
      buf = bufs[i];
      buf.copy(buffer, index, 0, buf.length);
      index += buf.length;
      delete bufs[i];
    });

    return buffer;
  };

function sysex(chunk,callback,timestamp) {

	if (sysex_buf) {
		sysex_buf=concat(sysex_buf,chunk);
	} else {
		sysex_start=-1; // start of sysex
		sysex_len=0;
		sysex_offset=0; // sysex_end search offset
		sysex_buf=chunk;
	};

	if (sysex_start<0) {
		for (var i=0; i<sysex_buf.length; ++i) {
			if (sysex_buf[i]==240) {
				sysex_start=i;
				break;
			}
		}
	};

	if (sysex_start>=0) {
		var sysex_end=null;
		if (!sysex_offset) {
			sysex_offset=sysex_start;
			sysex_len=2;
		};
		while (sysex_offset<sysex_buf.length) {
			if (sysex_buf[sysex_offset]<128) {
				++sysex_len;
			} else {
				if (sysex_buf[sysex_offset]==247) {
					sysex_end=sysex_offset;
					break;
				}
			};
			++sysex_offset;
		};

		if (sysex_end) {
			var sysex=new Buffer(sysex_len);
			sysex[0]=240;
			var index=1;
			for (var i=sysex_start; index<sysex_len-1; ++i) {
				if (sysex_buf[i]<128) {
					sysex[index]=sysex_buf[i];
					++index;
				}
			};
			sysex[sysex_len-1]=247;

			if (i+1==sysex_buf.length) {
				sysex_buf=null;
			} else { 
				sysex_buf=sysex_buf.slice(i);
			};
			sysex_start=-1;
			sysex_offset=0;

			callback(sysex,timestamp);
		}

	} else {
		sysex_buf=null;
	}
};

module.exports = {
  parse: sysex,
  concat: concat
};


