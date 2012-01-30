/*
    server.js: basic http server
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

//var httpdigest=require('http_digest');
var Module=require('module');
var http=require('http');
var file=require('file');
var fs=require('fs');
var sio=Module._load('./socket.io');
var mime=require('mime');
var url=require('url');
var username='demo';
var password='mpxg2';

function server(options,callback) {

	var self=this;

	this.port=options.port||80;
	this.addr=options.addr||'0.0.0.0';
	this.root=options.root||'./www';

	//this.http=httpdigest.createServer(username,password,function(request,response) {
	this.http=http.createServer(function(request,response) {
		try {
			handle_request({
				request: request,
				response: response,
				callback: function(err,msg) {
					if (err) {
						response.writeHead(err, {'Content-Type': 'text/plain'});
						response.end(msg);
					}
				}
			});
		} catch(e) {
			console.log(e,e.stack);
		}
	});

	this.io=sio.listen(self.http);
  this.io.configure(function(){
    self.io.set('log level', 1);
    self.io.set('transports', [
      'websocket'
    , 'flashsocket'
    , 'htmlfile'
    , 'xhr-polling'
    , 'jsonp-polling'
    ]);
    self.io.enable('browser client minification');
    self.io.enable('browser client etag');
    self.io.enable('browser client gzip');
  });


	this.URLs=[];

  this.http.on('error',function(e){
    if (e.code=='EADDRINUSE') {
      var _utils=require('_utils');
      _utils.url_open('http://localhost:8081',function(){
        setTimeout(function(){process.exit(1)},3000);
      });
    } else {
      console.log(e);
    }
  });

	this.http.listen(this.port,this.addr,function(){
		self.IPList=self.getIPv4AddressList();
		console.log('listening to localhost:'+self.port);
		for (var iface in self.IPList) {
			console.log('listening to',self.IPList[iface]+':'+self.port);
			self.URLs.push('http://'+self.IPList[iface]+':'+self.port);
		}
		if (callback) callback(self);
	});
	

	this.getIPv4AddressList=function(device) {
		var os=require('os');
		var ifaces=os.networkInterfaces();
		var ret={};
		for (var dev in ifaces) {
			if (dev=='lo' || device && device!=dev) continue;
			var alias=0;
			ifaces[dev].forEach(function(details){
				if (details.family=='IPv4' && details.address!='127.0.0.1') {
					ret[dev+(alias?':'+alias:'')]=details.address;
					++alias;
				}
			});
		}
		return ret;
	};

	function handle_request(pb) {

		pb.url=url.parse(pb.request.url,true);
	
		switch (pb.request.method) {
			case 'GET':
				//console.log('GET',pb.request.url);
				switch (pb.url.pathname) {
					case '/':
						pb.url.pathname='/index.html';
						break;
				};
//				process.nextTick(function(){
					self.GET(pb)
//				});
				break;

      case 'POST':
//				process.nextTick(function(){
					self.POST(pb)
//				});
				break;

			default:
				pb.callback(404,'Page not found !');
				break;
		}
	};

	this.http_auth_check=function(user,pass) {
		return (user==username && pass==password);
	};

	this.GET=function(pb) {

		var path=self.root+pb.url.pathname;
		fs.stat(path,function(err,stats){
			var mime_type=mime.lookup(path);
			var isHTML=(mime_type=='text/html');
			var m=mime_type.split('/');
			var encoding;
			switch(m[0]) {
				case 'image':
				case 'audio':
				case 'video':
				case 'application':
    					encoding='binary';
					break;
				default:
					encoding='utf8';
					break;
			};
			if (err) {
				try {
					var page=file.readFile(path,encoding);
					if (page.length) {
						err=0;
						stats=null;
					}
				} catch(e) {
					console.log(e)
				};
			};

			if (err) {
				console.log(err);
				pb.callback(404,'Page not found !');

			} else {

				if (!stats) {
					pb.response.writeHead(200, {
						'Content-Type': mime_type,
						'Content-Length': page.length
					});
					if (encoding=='binary') {
						process.nextTick(function(){streamIt(pb,page,encoding,0);});
						return;
					};
					//console.log(typeof(page));

					pb.response.end(page,encoding);
					return;
				};

				pb.response.writeHead(200, {
					'Content-Type': mime_type,
					'Content-Length': stats.size
				});

				var rs=fs.createReadStream(path);


				rs.on('data',function(chunk){
					pb.response.write(chunk,encoding);
				});
				rs.on('end',function() {
					pb.response.end();
				});
				rs.on('error',function(err){
					console.log('read error :',path);
					console.log(err);
				});
			}
		});
	}
};

this.POST=function(pb) {
  pb.response.end('');
};

function streamIt(pb,buf,encoding,offset) {
	var end=(buf.length-offset)>4096?offset+4096:buf.length;
	if (end==buf.length) {
		pb.response.end(buf.slice(offset),encoding);
	} else {
		pb.response.write(buf.slice(offset,end),encoding);
		offset=end;
		process.nextTick(function(){
			streamIt(pb,buf,encoding,offset);
		});
	}
};

mime.define({
	'text/html': ['html','htm'],
	'text/css': ['css'],
	'text/plain': ['txt'],
	'application/javascript': ['js'],
	'image/jpeg': ['jpeg','jpg','jpe'],
	'image/png': ['png'],
	'image/x-ico': ['ico'],
	'application/octet-stream': ['syx'],
});

module.exports={
	http: server
};

