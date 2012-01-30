for f in *.css ; do echo "==== $f" ; yuicompressor $f > ../css-min/$f ; done
