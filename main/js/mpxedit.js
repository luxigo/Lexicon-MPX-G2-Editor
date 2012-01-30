VERSION='1.0a2';

var longpoll_timeout;

var console={
  log: function(){}
}

var socket;

function socket_connect(){
  if (typeof(io)=="undefined" || socket) return;
  socket = io.connect(document.location.origin);
  socket.on('connect',function(){
    console.log('register');
    socket.emit('register',window.name,function(){
      console.log('socket ready');
    });
  });
  socket.on('automation',function(script){
    if (script.length) {
      console.log(script);
      eval(script);
    }
  });
  socket.on('reconnect_failed',function(){
    socket=null;
    setTimeout(socket_connect,3000);
  });
};

$('.ui-page').live('pageinit',function(){

  socket_connect();

  console.log('init');
  try {
    setupdnd();
  } catch(e) {
  };

  $('select').die('change').live('change',select_change);
  $('input').die('change').live('change',input_change);
  $('input').die('input').live('input',function(){
    $(this).trigger('change')
  });

  if (window.name=="") {
    window.name=(Math.random().toString().substr(2))+'_'+(new Date()).getTime();
  }
  $('.ui-navbar li, .column.secondary li').die('click').live('click',navbar_click);

  $('#midi_settings input:checked').change();

  checkupdate();

  $('.man-image').die('click').live('click',function(e){
    $('.ui-footer').remove();
    var width=$(this).width();
    var pos=e.pageX-$(this).offset().left;
    var pageNum_alpha=$(this).attr('src').replace(/[^0-9]+/g,'');
    var pageNum=parseInt(pageNum_alpha,10);
    if (pos<width/3) {
      if (pageNum>0) --pageNum;
    } else if (pos>(width-width/3)){
      if (pageNum<171) ++pageNum;
    }
    if (pageNum<10) {
      pageNum='00'+pageNum;
    } else if (pageNum<100) {
      pageNum='0'+pageNum;
    }
    var self=$(this);
    $(this).unbind('load').bind('load',function(){
      $('.ui-title').text('Manual - Page '+parseInt(pageNum,10));
      $('title').text('MPXG2Edit - Manual - Page '+parseInt(pageNum,10));
      self.unbind('load');
    }) 
    .attr('src','/man/page-'+pageNum+'.jpg');
    return false;
  });

});

$('.ui-page').live('pagecreate',function(){

  console.log('create');
  $('#help').die('click').live('click',function(){
    var datalevel=$('li[data-level]:first');
    if (datalevel.size()) {
      document.location.assign('/help?p='+datalevel.data('level').substr(1));
    } else {
      document.location.assign('/help?p=00');
    }
  });

  var form_files;
  $('input#file')
    .die('change').live('change',function(e){
      $('input.submit').closest('.ui-btn').addClass('ui-disabled');
      $('input.filename').val('');
      var readFileSize = 0;
      var files = e.target.files;
      form_files=files;
      var result=$.check_files(files,{extensions: 'syx'},function(){
        alert('Only raw sysex files (.syx)');
        return false;
      });
      if (result) {
        $('input.filename').val($.getFilesInfo(files).names.join(', '));
        $('input.submit').closest('.ui-btn').removeClass('ui-disabled');
      }
    })
    .each(function(){
      if ($(this).closest('.filewrap').size()) {
        return;
      }
      $(this).css({
        opacity: 0,
        position: 'absolute'
      }).wrap('<div class="filewrap" />');
      $(this).parent().prepend('<table><tr><td class="filename"><input name="file" type="text" class="filename"></td><td><button class="filebutton">Browse</button></td></tr></table>');
    });

  $('button.filebutton, input.filename').die('click').live('click',function(){
    $('input#file').click();
    return false;
  });
  $('input.submit').die('click').live('click', function() {
      if ($.upload_confirm(form_files)) {
        var form_data=new $.multipartFormData();
        form_data.addFileList(form_files);
      }
      return false;
  });

 $('#dump_selection').die('click').live('click', function() {
   var download=$('input#download:checked').size();
   var what=$('input[type=radio]:checked').val();
   document.location.href='/dump?what='+what+'&dl='+download;
 });

});

function getDocHeight() {
    var D = document;
    return Math.max(
        Math.max(D.body.scrollHeight, D.documentElement.scrollHeight),
        Math.max(D.body.offsetHeight, D.documentElement.offsetHeight),
        Math.max(D.body.clientHeight, D.documentElement.clientHeight)
    );
}

$('.ui-page').live('pageshow',function(){
  console.log('show');
  $('input#file').css({
    opacity: 0
  });

  options_removeUnderscores(); 

  try {
    if ($('td.secondary').is(':visible')) {
      var prim=$('td.primary ul li:last');
      var sec=$('td.secondary ul li:last');
      if (prim.size()&&sec.size()) {
        var h1=prim.offset().top+prim.height();
        var h2=sec.offset().top+sec.height();
        h=(h2>h1)?h2:h1;
        var wh=getDocHeight-$('td.primary:first').offset().top;
        var ch=window.innerHeight?window.innerHeight:document.documentElement.clientHeight;
        ch-=$('td.primary:first').offset().top;
        if (ch>h) h=ch; else if (wh>h) h=wh;
        if (h1!=h) $('td.primary').height(h+'px');
        if (h2!=h) $('td.secondary').height(h+'px');
      }
    }
  } catch(e) {
     console.log(e);
  }

  $(window).unbind('resize.vcenter').bind('resize.vcenter',function() {
      var height=window.innerHeight?window.innerHeight:document.documentElement.clientHeight;
      $('.vertical-center').css({
         position: 'relative',
         top: Math.floor((height-$('.vertical-center').height())/3)+'px' 
      });
  }).trigger('resize');

  $('input.submit').closest('.ui-btn').addClass('ui-disabled');
  var ul=$('ul[data-toplevel]');
  if (ul.size()) {
    var L=ul.data('toplevel');
    if (L) {
      $('li.ui-btn-active, li.effet-current').removeClass('effect-current ui-btn-active');
      $('td.secondary li[data-ref='+L+']').addClass('effect-current ui-btn-active');
    }
  }

if (false)
  $('.ui-navbar a').each(function(){
    var link=$(this);
    if (link.attr('href')==document.location.pathname.substr(1)) {
      link.addClass('effect-current ui-btn-active');
    } else {
      link.removeClass('effect-current ui-btn-active');
    }
  });

  $('#help').die('click').live('click',function(){
    var datalevel=$('li[data-level]:first');
    if (datalevel.size()) {
      document.location.assign('/help?p='+datalevel.data('level').substr(1));
    } else {
      document.location.assign('/help?p=00');
    }
  });
  $('img, a').attr('draggable','false');
});

$('div').live('pagehide', function(event, ui){
  var page = $(event.target);
  if(page.attr('data-cache') == 'no'){
    page.remove();
  };
});

$('div').live('pagebeforecreate', function(event, ui){
  var page = $(event.target);

});

$.fn.getSelection=function(attributeName) {
  return this.find('option:selected').attr(attributeName||'value')
};

function alert_dialog(message) {
  console.log(message);
  alert(message);
};

function levels(L) {
  var ret=[];
  for (var i=0; i<L.length; i+=2) {
    ret.push(parseInt(L.substr(i,2),16));
  }
  return ret;
}

function select_change(e){
  var select=$(e.target);
  if (select.data('noMessage')) {
    select.data('noMessage',false);
    return true;
  }
  var L=select.attr('id').substr(1);
  var value=get_value(select.closest('li'));

console.log(L+','+value);
  dataMessage(L,value);

}

var input_change_timeout=[];
function input_change(e){
  var input=$(e.target);

  if (input.data('noMessage')) {
    input.data('noMessage',false);
    return true;
  }

  var timeout=input.attr('changeTimeout');
  if (timeout) {
    clearTimeout(timeout);
  }

  switch (input.attr('name')) {
    case 'midiin':
    case 'midiout':
      input.attr('changeTimeout',setTimeout(function(){
        $.ajax({
          type: 'GET',
          url: '/'+input.attr('name')+'?name='+input.next('label').text()+'&uid='+window.name,
          async: true,
          error: function(XMLHttpRequest, textStatus, errorThrown){
            alert_dialog('MIDI interface selection: ' + (errorThrown ? errorThrown : XMLHttpRequest.responseText));
          }
        });
      },100));
      return false;

    case 'deviceID': 
      input.attr('changeTimeout',setTimeout(function(){
        $.ajax({
          type: 'GET',
          url: '/'+input.attr('name')+'?id='+input.val()+'&uid='+window.name,
          async: true,
          error: function(XMLHttpRequest, textStatus, errorThrown){
            alert_dialog('MIDI deviceID selection: ' + (errorThrown ? errorThrown : XMLHttpRequest.responseText));
          }
        });
      },100));
      return false;

    case 'filter':
    case 'program':
    case 'file':
    case 'dl_what':
    case 'download':
      return false;
  }

  var L=input.attr('id').substr(1).replace(/-.*/,'');

  if (input.hasClass('ui-slider-input')) {
    var val=parseInt(input.val());
    var min=parseInt(input.attr('min'));
    if (val<min) {
      input.val(min);
    } else {
      var max=parseInt(input.attr('max'));
      if (val>max) {
        input.val(max);
      }
    }
  }

  var value=get_value(input.closest('li'));

  input.attr('changeTimeout',setTimeout(function(){
    dataMessage(L,value);
  },50));
}

function get_value(li) {
  var value;
  var options=li.find('.option');

  var mainValue=li.find('.mainValue');
  if (!mainValue.size()) {
    mainValue=li;
  }
  if (mainValue.size()==2) {
    mainValue=mainValue.find('input');
    value=parseInt($(mainValue.get(0)).val())+(parseInt($(mainValue.get(1)).val())<<8);
  } else {
    var radio=mainValue.find('input:checked');
    if (radio.size()) {
      value=radio.val();
    } else {
      var input=mainValue.find('input');
      if (input.size()) {
        value=input.val();
      } else {
        value=mainValue.find('select').getSelection();
      }
    }
  }

  options.each(function(){
    var radio=$(this).find('input:checked');
    if (radio.size()) {
      value+=','+radio.val();
    } else {
      var input=$(this).find('input');
      if (input.size()) {
        value+=','+input.val();
      } else {
        value+=','+$(this).find('select').getSelection();
      }
    }
  });

  return value;
}

function param_update(addr,optionType,option) {
  var li;
  var fieldset=$('fieldset.f'+addr);
  if (fieldset.data('unit')==option) {
    return false;
  }
  li=fieldset.closest('li');

  if (li) {
    socket.emit('getParam',addr,function(html){
      console.log(html);
      var ul=li.parent();
      li.replaceWith(html);
      ul.trigger('create').listview('refresh');
    });
    return true;
  }

  return false;
}

function algorithm_change(L){

  var hex;
  var select;
  if (L && L.length==6) {
    var automation=true;
    hex=L.substr(4);
    L=L.substr(0,4);
    select=$('select#a'+L);
    if (!select.size()) {
      return;
    }
    select.data('noMessage',true).val(parseInt(hex,16)).change();

  } else {
    select=$('select#a'+L);
    if (!select.size()) {
      return;
    }
    hex=parseInt($('select#a'+L).getSelection()).toString(16);
    hex=((hex.length==1)?'0':'')+hex;
  }
  socket.emit('getEffect',L+hex,function(html){
    var ul=$('select#a'+L).closest('ul');
    if (html.length) {
      ul.html(html);
      ul.trigger('create').listview('refresh');
      options_removeUnderscores();
    } else {
      var next=$('select#a'+L).closest('li').next();
      if (next.size()) {
        var alg=parseInt(next.data('level').substr(5,2),16);
        $('select#a'+L).data('noMessage',true).val(alg).change();
      } else {
        $('select#a'+L).data('noMessage',true).val(0).change();
      }
    }
  });
}

function options_removeUnderscores() {
  var current=$('.ui-select .ui-btn-text');
  if (!current.size()) return;
  current.get(0).innerHTML=current.get(0).innerHTML.replace(/_/g,'');
  var options=document.getElementsByTagName('OPTION');
  for (var i=0; i<options.length; ++i){
    options[i].innerHTML=options[i].innerHTML.replace(/_/g,'&nbsp;');
  }
}

function program_change(prog) {
  var ul=$('ul[data-toplevel]');
  if (!ul.size()) {
    return;
  }
  var L=ul.data('toplevel').substr(1);
  socket.emit('update',L,function(html){
    if (html.length) {
      ul.html(html);
      ul.trigger('create').listview('refresh');
      console.log(html);
    } else {
      document.location.reload();
    }
  });
}

function insert_toggle() {
  panel_button(0x1F);
  panel_button(0x35);
}

function tuner_toggle() {
  panel_button(0x20);
  panel_button(0x36);
}

function bypass_toggle() {
  panel_button(0x36);
}

function panel_button(value) {
  dataMessage('System.Panel.PnlButton',value);
}

function dataMessage(L,value) {
  socket.emit('dataMessage',{
    L: L,
    data: value
  },function(script){
    if(script) {
      console.log(script);
      eval(script);
    }
  });
}

function navbar_click(e) {
  var a=$(e.target).find('a');
  if (a.size()==0) {
    a=$(e.target).closest('li').find('a');
  }
  var L=a.attr('href').replace(/.html/,'');

  if (L.length==4 && parseInt(L,16)<7) {
    var elem=(a.hasClass('ui-link-inherit'))?a.closest('li'):a;
    if (elem.hasClass('effect-current')) {
      effect_bypass_toggle(L.substr(2));
    } else {
      $('.effect-current').removeClass('effect-current');
      elem.addClass('effect-current');
    }
  }
  return true;
}

function effect_bypass_toggle(L) {
  socket.emit('bypass',L);
}

function checkupdate() {
  if ($('iframe#checkupdate').size()) return;
  $('<iframe id="checkupdate" style="width:0, height:0;" src="http://www.miprosoft.com/mpxg2/update/'+VERSION+'"></iframe>').appendTo(document.body);
}

$.multipartFormData=function(options) {
  var self=this;
  var CRLF=String.fromCharCode(0xd)+String.fromCharCode(0xa);
  this.formBoundary=null;
  this.payload='';
  
  var defaults={
    ajax: {
      url: '/upload',
      dataType: 'json',
      success: function(json) {
        console.log(json);
        if (json.script) {
          try { 
            eval(json.script);
          } catch(e) {
            console.log(e);
          }
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        alert('Upload failed');
      }
    },
    nothing_to_send: function(files) {
      alert('Nothing to send (empty file ?)');
    }
  };

  this.options=$.extend(true,defaults,options);

  this.addFileList=function(files,callback) {
    var filesAdded=0;
    var filesCount=files.length;
    self.formBoundary=null;
    self.payload='';

    for (var i = 0, file; file = files[i]; i++) {
      var reader = new FileReader();
      reader.onerror = function(e) {
        alert('payload_addFileList: Error ' + e.target.error.code);
      };

      reader.onload = (function(_self,aFile,_callback) {
        return function(evt) {
          _self.payload_addFile(_self,evt,aFile,_callback);
        };
      })(self,file,function(){
          ++filesAdded;
          if (filesAdded==filesCount) {
            if (callback) {
              callback()
            } else {
              self.payload_send();
            }
          }
      });
      reader.readAsBinaryString(file);
    }
    return false;
  }

  this.getFormBoundary=function() {
    if (!self.formBoundary) {
      self.formBoundary='------FormBoundary';
      var ranges=[
        { range: 10, base: '0'.charCodeAt(0)},
        { range: 26, base: 'A'.charCodeAt(0)},
        { range: 26, base: 'a'.charCodeAt(0)}
      ];
      for (var i=0; i<16; ++i) {
        var r=Math.floor(Math.random()*3);
        self.formBoundary+=String.fromCharCode(Math.floor(Math.random()*ranges[r].range)+ranges[r].base);
      }
    }
    return self.formBoundary;
  }

  this.payload_addFile=function(_self,e,file,callback) {
    _self.payload=(_self.formBoundary?_self.payload+CRLF:_self.getFormBoundary()+CRLF);
    _self.payload+='Content-Disposition: form-data; name="file"; filename="'+file.name+'"'+CRLF;
    _self.payload+='Content-Type: text/plain'+CRLF;
    _self.payload+=CRLF;
    // encode in hexadecimal
    e.target.result.split('').forEach(function(val,i){
      var c=val.charCodeAt(0);
      _self.payload+=(c<16?'0':'')+c.toString(16);
    });
    _self.payload+=CRLF+_self.getFormBoundary();
    callback();
  }

  this.payload_addField=function(name,value) {
    self.payload=(self.formBoundary?self.payload+CRLF:self.getFormBoundary()+CRLF);
    self.payload+='Content-Disposition: form-data; name="'+name+'"'+CRLF;
    self.payload+=CRLF;
    self.payload+=value;
    self.payload+=CRLF+self.getFormBoundary();
  }

  this.payload_send=function() {
    self.payload+='--'+CRLF+CRLF;
    console.log(self.payload);
    var boundary=self.getFormBoundary();
    self.formBoundary=null;
    $.ajax($.extend({},self.options.ajax,{
      type: 'POST',
      contentType: 'multipart/form-data; boundary='+boundary,
      data: self.payload,
      processData: false,
    }));
  }
}

$.upload_confirm=function(files,callback,_confirm) {
  var __confirm=_confirm||function(names,totalSize) {
    var size=(totalSize>1024)?Math.floor(totalSize/1024)+'KB':totalSize+' bytes';
    return confirm('Confirm transmission ('+size+') :             '+"\r\r"+names.join("\r"));
  };
  var totalSize = 0;
  var names=[];
  for (var i = 0, file; file = files[i]; i++) {
    totalSize += file.fileSize;
    names.push(file.name);
  }
  if (__confirm(names,totalSize)) {
    if (callback) {
      callback(files);
    }
    return true;
  } else {
    return false;
  }
};

$.check_fileExtension=function(files,extensions,catch_error) {
  var result=false;
  if (typeof(extensions)=="string") extensions=[extensions];
  for (var i = 0, file; file = files[i]; i++) {
    var fsplit=file.name.split('.');
    if (!fsplit.length || $.inArray(fsplit[fsplit.length-1].toLowerCase(),extensions)<0) {
      if (catch_error) {
        if (catch_error(files,i,'extension')) {
          continue;
        }
      } else {
        alert('Valid file extensions:  '+extensions.join(', '));
      }
      return false;
    } else {
      result=true;
    }
  }
  return result;
}

$.check_fileSize=function(files,size,catch_error) {
  var result=false;
  var totalSize=0;
  for (var i = 0, file; file = files[i]; i++) {
    if ((size.min!==undefined && file.fileSize<size.min) || (size.max!==undefined && file.fileSize>size.max)) {
      if (catch_error) {
        if (catch_error(files,i,'size')) {
          continue;
        }
      } else {
        alert(file.name+': Invalid file size');
      };
      return false;
    } else {
      totalSize+=file.fileSize;
      result=(size.max!==undefined && file.fileSize<=size.max);
    }
  };
  return result;
};

$.check_files=function(files,what,catch_error,callback) {
  var result=true;
  if (what.extensions) {
    result=$.check_fileExtension(files,what.extensions,catch_error);
  };
  if (result && what.size) {
    result=$.check_fileSize(files,what.size,catch_error);
  };
  if (callback) {
    callback(files,result);
  };
  return result;
};

$.getFilesInfo=function(files){
  var names=[];
  var totalSize=0;
  for (var i=0, file=null; file=files[i]; ++i) {
    names.push(file.name);
    totalSize+=file.fileSize;
  };
  return {
    names: names,
    totalSize: totalSize
  };
};

function onDragEnter(e) {
  e.stopPropagation();
  e.preventDefault();
}

function onDragOver(e) {
  e.stopPropagation();
  e.preventDefault();
  $(e.target).addClass('dragOver');
}

function onDragLeave(e) {
  e.stopPropagation();
  e.preventDefault();
  $(e.target).removeClass('dragOver');
}

function onDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  $(e.target).removeClass('dragOver');
  var files=e.dataTransfer.files;
  var ok=$.check_files(files,{extensions: 'syx'},function(){
    alert('Only raw sysex files (.syx)');
    return false;
  });
  if (ok && $.upload_confirm(files)) {
    var form_data=new $.multipartFormData();
    form_data.addFileList(files);
  }
  return false;
}

function setupdnd() {
  $('*').each(function(){
    try { 
      this.removeEventListener('dragenter', onDragEnter, false);
      this.removeEventListener('dragover', onDragOver, false);
      this.removeEventListener('dragLeave', onDragLeave, false);
      this.removeEventListener('drop', onDrop, false);
    } catch(e) {
      console.log(e);
    }
    try { 
      this.addEventListener('dragenter', onDragEnter, false);
      this.addEventListener('dragover', onDragOver, false);
      this.addEventListener('dragleave', onDragLeave, false);
      this.addEventListener('drop', onDrop, false);
    } catch(e) {
      console.log(e);
    }
  });
}

