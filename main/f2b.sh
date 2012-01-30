#!/bin/sh
rm www/man
ls -l toolbar.html wait.html index.html nothing_to_dump.html programs.html manpage.html config.html 0*html template_* *.json `find -L www/ -type f` 
files2buffer.js toolbar.html wait.html index.html nothing_to_dump.html programs.html manpage.html config.html 0*html template_* *.json `find -L www/ -type f` > ../lib/data.js
ln -s ../../man-1280 www/man
