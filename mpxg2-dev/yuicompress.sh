for f in *.js ; do echo "==== $f" ; yuicompressor $f > ../mpxg2-min/$f ; done
