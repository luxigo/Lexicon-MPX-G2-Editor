#!/usr/local/bin/node
var exec=require('child_process').exec;
var printf=require('printf');

var page=-1
var child;

function loop() {
	++page;
	if (page>172)
		process.exit(0);
	console.log(page);	
	child=exec('convert -colorspace Gray -density 1000x1000 MPX_G2.pdf['+page+'] -resize 3200x page-'+printf('%03d.png',page), function(){
			loop();
	});
	child.on('error',function(err){
		throw err;
	});
}

loop();
