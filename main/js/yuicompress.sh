for f in *.js ; do echo "==== $f" ; yuicompressor $f > ../js-min/$f ; done
