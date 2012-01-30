#!/bin/sh
set +x
set -e

rm mpxg2
ln -s mpxg2-min mpxg2
cd mpxg2-dev
./yuicompress.sh

cd ../main/css
./yuicompress.sh
cd ../js
./yuicompress.sh

cd ../www
rm js
rm css
ln -s ../js-min js
ln -s ../css-min css

cd ..
./f2b.sh

cd ../lib

rm _third_party_main.js
ln -s ../mpxg2-min/main.js _third_party_main.js

cd ..

make

strip -s out/Release/node
