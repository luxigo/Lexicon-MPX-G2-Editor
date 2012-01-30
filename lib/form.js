/*    
    form.js - parse multipart POST requests and file uploads
      
    Copyright (C) 2012 Luc Deschenaux
      
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

function form_receive(request,callback) {
  var data;
  request.on('data', function(chunk) {
    data=data?buffer.concat(data,chunk):chunk;
  });
  request.on('end',function(){
    callback(form_parse(data));
  });
}

function form_parse(data) {

  var i=0;
  var marker;
  var form=[];

  function getMarker() {
    marker=String.fromCharCode(0xd)+String.fromCharCode(0xa);
    while(i<data.length && data[i]!=0xd) {
      marker+=String.fromCharCode(data[i]);
      ++i;
   }
  }

  getMarker();

  if (i>=data.length) {
    throw "form parse error";
  }

  var separator=':'.charCodeAt(0);
  // parse form
  while(true) {
    var form_data=new Object;
    var headers=new Object;

    i+=2;
    // parse headers
    while (true) {
      var header_name='';
      while(i<data.length && data[i]!=separator && data[i]!=0xd) {
        header_name+=String.fromCharCode(data[i]);
        ++i;
      }

      if (header_name.length=0) {
        break;
      }

      if (i==data.length || data[i]!=separator) {
        throw "form parse error";
      }

      var header_value='';
      ++i;
      while(i<data.length && data[i]!=0xd) {
        header_value+=String.fromCharCode(data[i]);
        ++i;
      }
      if (i==data.length) {
        throw "form parse error";
      }
      header_name=header_name.trim().toLowerCase();
      header_value=header_value.trim();
      headers[header_name]=header_value;

      // parse form-data
      if (header_name=='content-disposition') {
        header_value.split(';').forEach(function(val,n) { // split not good...
          val=val.trim();
          if (n==0) {
            if (val.toLowerCase()=='form-data') return;
            else throw "form parse error";
          }

          var fd_name='';
          for (var j=0; j<val.length && val[j]!='='; ++j) {
            fd_name+=val[j];
          }
          if (j==val.length) {
            throw "form parse error";
          }
          ++j;
          if (val[j]!='"' || val[val.length-1]!='"') {
            throw "form parse error";
          }
          var fd_val=val.substr(j+1, val.length-j-2);
          form_data[fd_name]=fd_val;
        });
      }

      i+=2;
      if (i+2>data.length) {
        throw "form parse error";
      }
      if (data[i]==0xd) {
        i+=2;
        break;
      }
    }

    function isMarkerAt(i) {
      if (i+marker.length>data.length) {
        throw "form parse error";
      }
      for (var k=0; k<marker.length; ++k) {
        if (data[i+k]!=marker.charCodeAt(k)) {
          return false;
        }
      }
      return true;
    }

    // extract data
    var formDataBody_start=i;
    while(!isMarkerAt(i)) {
      ++i;
    }

    var formDataBody;
    var formDataBody_length=i-formDataBody_start;
    if (formDataBody_length) {
      if (form_data['filename']) {
        formDataBody=[];
        for (var k=0; k<formDataBody_length; ++k) {
          formDataBody.push(data[formDataBody_start+k]);
        }
      } else {
        formDataBody='';
        for (var k=0; k<formDataBody_length; ++k) {
          formDataBody+=String.fromCharCode(data[formDataBody_start+k]);
        }
      }
      form_data['body']=formDataBody;
      console.log('length',formDataBody_length);
    }

    form.push({
      headers: headers,
      form_data: form_data
    });

    i+=marker.length;
    if (i+2>data.length) {
      throw "form parse error";
    }
    if (data[i]=='-'.charCodeAt(0) && data[i+1]=='-'.charCodeAt(0)) {
      break;
    }
  }

  return form;
}

module.exports={
  receive: form_receive,
  parse: form_parse
};

