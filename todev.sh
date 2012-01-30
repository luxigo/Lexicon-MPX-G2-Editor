#!/bin/sh
set +x
set -e

rm mpxg2
ln -s mpxg2-dev mpxg2


cd main/www
rm js || true
rm css || true
ln -s ../js js
ln -s ../css css

cd ..
./f2b.sh

cd ../lib

rm _third_party_main.js
cp _third_party_main-dev.js  _third_party_main.js

cd ..

make

strip -s out/Release/node
