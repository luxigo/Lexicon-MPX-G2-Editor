#!/usr/local/bin/node
var fs=require('fs');

console.log('var data={};');
for (var f=2; f<process.argv.length;++f) {

	var buf='';
	var path=process.argv[f];
	var content;
	var ext=path.replace(/.*\.([^\.]+)$/,"$1").toLowerCase();
	switch(ext) {
		case 'types':
		case 'txt':
		case 'js':
		case 'css':
		case 'html':
		case 'htm':
		case 'txt':
		case 'json':
			encoding='utf8';
			content=fs.readFileSync(path,encoding);
			for (var i=0; i<content.length; ++i) {
				buf+=(i?',':'')+content.charCodeAt(i);
			}
			break;
		default:
			encoding='binary';
			content=fs.readFileSync(path,encoding);
			for (var i=0; i<content.length; ++i) {
				buf+=(i?',':'')+content.charCodeAt(i);
			}
			break;
	}
	var def='data["'+path+'"]=new Buffer(['+buf+'])';
	console.log(def);
}
console.log('module.exports=data;');
