/*
    mpxg2edit.js

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

var fs=require('fs');
this.os=require('os');
if (this.os.platform()=='darwin') {
  fs.chdir('/Applications/MPXG2Edit');
}
  
var self=this;
var form=require('form');
var lexicon=require('lexicon');
var server=require('server');
var printf=require('printf');
var file=require('file');
var util=require('util');
var _utils=require('_utils');

var config={};
var native_menus='data-native-menu="true"';
var programBank={
	system: [],
	user: []
};

var usedSteps='?';

var global_library={
};

var prefs={
  midiin: '',
  midiout: '',
  deviceID: 0,
};

var crypto=require('crypto');
var io;

var GET;
var POST;
var g2;

var controlTree;
var objectDescription;

function init() {
  prefs_load();
  g2=self.g2=new lexicon.mpxg2({
    MIDI_INPUT: prefs.midiin,
    MIDI_OUTPUT: prefs.midiout,
    DEVICE_ID: prefs.deviceID
  },
  function(err){
		g2.status=err;
   	if (!err) {
   		g2.dataMessage_process=dataMessage_process;
   		g2.midiAutomation_set(true);
      g2.getUsedSteps(usedSteps_update);
//    mpx_controlTree_gui(mpxg2);
    }
  });

	try {
		self.http=new server.http({
			port: 8081

		},function(http){
			if (http.io) {
				http.io.sockets.on('connection',function(socket) {
					if (g2.DEBUG) console.log('incoming connection');
					socket.on('register', function(uid,callback){
						socket.set('uid',uid);
            automationq_send(socket);
            callback(true);
					});
          socket.on('disconnect',function(){
            if (automation_pb[socket.id]) {
              delete automation_pb[socket.id];
            }
          });
          socket.on('getParam',function(L,callback){
            var unique=true;
            var levels=levels_parse(L);
            disable_automation=true;
            loop(levels.length,levels.length,levels,'',function(html){
              callback(html);
              disable_automation=false;
            },unique);
          });
          socket.on('getEffect',function(L,callback){
            var levels=levels_parse(L);
            // check effect is loaded
            disable_automation=true;
            g2.dataMessage_request(levels.length-1,levels,function(dm,msg){
              if (dm.data[0]==levels[levels.length-1]) {
                try {
                  loop(levels.length,levels.length,levels,'',function(html){
                    callback(html);
                    process.nextTick(function(){
                      disable_automation=false;
                    });
                  });
                } catch(e) {
                  console.log(e);
                  pb.response.end('');
                  process.nextTick(function(){
                    disable_automation=false;
                  });
                }
              } else {
                callback('');
                process.nextTick(function(){
                  disable_automation=false;
                });
              };
            });
            return false;
          });
          socket.on('update',function(L,callback){
            var levels=levels_parse(L);

            if (g2.DEBUG>0) console.log(levels,levels.length);

            if (levels.length==2 && levels[0]==0 && levels[1]<7) {
              disable_automation=true;
              g2.dataMessage_request(2,levels,function(dm){
                levels.push(dm.data[0]);
                loop(3,3,levels,'',function(html){
                  if (g2.DEBUG>0) console.log(html);
                  callback(html);
                  process.nextTick(function(){
                    disable_automation=false;
                  });
                });
                return false;
              });
            } else {
              try {
                loop(levels.length,levels.length,levels,'',function(html){
                  callback(html);
                });
              } catch(e) {
                console.log(e);
                callback('');
              }
            };
          });
          socket.on('dataMessage',function(Ldata,callback){
            var L=Ldata.L;
            var data=Ldata.data;
            var script='';
            if (g2.DEBUG>0) console.log('dataMessage',L,data);
            if (L && L.length) {
              var levels=levels_parse(L);
              var data;
              var curLevel=g2.getLevel(levels.length,levels);
              var od=g2.config.objectDescription[curLevel.objectType];
              if (/^[\-0-9]+,[0-9,]+$/.test(data)) {
                var rawData=data.split(',');
                rawData[0]=parseInt(rawData[0]);
                rawData[1]=parseInt(rawData[1]);

                if (g2.DEBUG>0) console.log('optionType',od.optionType.toString(16));
                switch(od.optionType) {
                  case 0x13b:
                    if (rawData[1]==1 && rawData[0]>=0) {
                      rawData[0]=-97;
                    } else if (rawData[1]==0 && rawData[0]<0) {
                      rawData[0]=100;
                    };
                  case 0x12f:
                  case 0x130:
                  case 0x131:
                  case 0x132:
                  case 0x133:
                  case 0x135:
                  case 0x136:
                    script+="param_update('"+L+"',"+od.optionType+","+rawData[rawData.length-1]+");";
                    break;

                  case 0x12c:
                  case 0x12d:
                  case 0x12e:
                  case 0x134:
                  case 0x139:
                  case 0x13a:
                  case 0xffff:
                    break;

                  default:
                    console.log('dataMessage: unhandled optionType',od.optionType.toString(16));
                    process.exit(0);
                    break;
                };

                switch(od.dataSize) {
                  case 1:
                    data=g2.nibblize(rawData[0]);
                    break;
                  case 2: data=g2.nibblize16(rawData[0]);
                    break;
                };
                if (od.optionType!=0xffff) {
                  var ood=g2.config.objectDescription[od.optionType];
                  if (ood.dataSize) {
                    if (ood.objectType==0x139) {
                      rawData[1]=parseInt(rawData[1])+1;
                    };
                    data=data.concat(g2.nibblize(rawData[1]));
                  }
                }
              } else {
                if (od.displayUnits[0]==0x30) {
                  data=data.split('');
                  data.forEach(function(c,i){
                    data[i]=c.charCodeAt(0);
                  });
                  if (data.length>od.dataSize) {
                    data=data.splice(0,od.dataSize);
                  } else while (data.length<od.dataSize) {
                    data.push(0x20);
                  };
                  data=g2.nibblize(data);
                } else {
                  data=parseInt(data);
                }
              };

              if (g2.DEBUG>0) console.log('data:',data);
              var dm=g2.dataMessage(levels.length,levels,data);
              dm.raw=dm.data;
              dm.data=new Buffer(dm.dataSize);
              for (var j=0,i=0; j<dm.dataSize; ++j) {
                dm.data[j]=dm.raw[i]+(dm.raw[i+1]<<4);
                i+=2;
              };

              dm.automation=true;
              dataMessage_process(dm,socket); // automation other clients
              
              // set short addresses mode ?
              if (levels.length==3 && levels[0]==1 && levels[1]==18 && levels[2]==5) {
                g2.shortAddresses_set(parseInt(data));
              };

              // algoritm ?
              if (g2.DEBUG>0) console.log(dm);
              if (!disable_automation &&  dm.numLevels==2 && levels[0]==0 && levels[1]<7) {

                g2.getUsedSteps(function(steps){
                  usedSteps_update(steps);
                  script+="algorithm_change('"+L+"');";
                  if (g2.DEBUG>0) console.log('dataMessage script:',script);
                  if (script.length) socket.emit('automation',script);
                  g2.patching_destinations_to_be_rebuild=true;
                });

              } else {
                if (g2.DEBUG>0) console.log('dataMessage script:',script);
                if (script.length) socket.emit('automation',script);

                if (dm.numLevels==2 && levels[0]==0 && levels[1]<7) {
                  g2.patching_destinations_to_be_rebuild=true;
                  //disable_automation=true;
                  //g2.patching_destinations_rebuild(function(){
                  //	disable_automation=false;
                  //});
                };
              }
              if (g2.FIND_OFFSET_IN_DUMP) {
                g2.chg_levels=levels;
              }
            };

            if (g2.FIND_OFFSET_IN_DUMP) {
              g2.programDump();
            };
          });
          socket.on('request',function(L,callback){
            if (L && L.length) {
              var levels=levels_parse(L);
              var str='';
              g2.dataMessage_request(levels.length,levels,function(dm){
                g2.dump(dm.data,0,function(line){
                  if (line.length) {
                    str+=line+'\r';
                  } else {
                    callback(str);
                  }
                });
              });
            }
          });
          socket.on('bypass',function(L,callback){
            var levels=g2.getLevelsByName('Program.Byp');
            levels.push(parseInt(L,16));
            g2.dataMessage_request(levels.length,levels,function(dm){
              g2.dataMessage(levels.length,levels,1-dm.data[0]);
              if (callback) callback();
              return false;
            });
            return;
          });
        });
			};
			_utils.url_open('http://localhost:8081');
		});

		GET=self.http.GET;
		self.http.GET=self.GET;
		POST=self.http.POST;
		self.http.POST=self.POST;

	} catch(e) {
		console.log('err',e);
	};

	g2.DEBUG=9;
};

function levels_parse(L) {
	if (L.substr(0,1)!='0') {
		return g2.getLevelsByName(L);
	};
	var ret=[];
	for (var i=0; i<L.length; i+=2) {
		ret.push(parseInt(L.substr(i,2),16));
	};
	return ret;
};

var automationq=[];
var disable_automation;
function dataMessage_process(dm,socket) {
	dm.curLevel=g2.getLevel(dm.numLevels,dm.levels);
	if (dm.curLevel) {
		if (g2.DEBUG>0) console.log(dm);
    if (/System.ProgramDump.*/.test(dm.path)) {
      if (g2.all_programs_dump_timeout) {
        clearTimeout(g2.all_programs_dump_timeout);
        g2.all_programs_dump_timeout=0;
      };
  		var programNumber=g2.parseProgramAddr(dm.numLevels,dm.levels);
  		var programName=g2.getProgramName(dm.data);
      var hash=crypto.createHash('sha').update(dm.data).digest('hex');
      if (!global_library.program) {
        global_library.program={};
      }
      var notInLib=(global_library.program[hash]==undefined);
      if (notInLib) {
        global_library.program[hash]={
          name: programName,
          no: programNumber,
          data: bufferToArray(dm.data),
          date: new Date().getTime()
        };
      };
      if (g2.all_programs_dump_callback) {
        g2.all_programs_bank[programNumber]={
          name: programName,
          data: dm.data,
          raw: dm.raw
        };
        g2.all_programs_dump_timeout=setTimeout(function(){
          g2.all_programs_dump_callback();
          g2.all_program_dump_callback=undefined;
          fs.writeFile('library.mpx',JSON.stringify(global_library),'utf8');
        },1500);
      } else {
        if (notInLib || self.writeLib_timeout) {
          if (self.writeLib_timeout) {
            clearTimeout(self.writeLib_timeout);
            self.writeLib_timeout=null;
          };
          self.writeLib_timeout=setTimeout(function(){
            fs.writeFile('library.mpx',JSON.stringify(global_library),'utf8');
          },1500);
        }
      };
      return false; 
    };

	  if (disable_automation) return false;
		if (socket==undefined) {
			dm.automation=true;
		};

		if (g2.DEBUG) console.log('automation incoming data from '+getuid(socket)+', message destination:',dm.path);
		automationq.push({dm:dm,socket:socket});
		automationq_send();
	};
	return false;
};

var automation_pb={};
var automation_late=[];
function automationq_send(socket) {
  var uid=getuid(socket);
  if (socket) {
    automation_pb[uid]=socket;
  }

	if (!automationq.length) {
		return;
	};

	var dm_socket=automationq.shift();
	var dm=dm_socket.dm;
  var socket=dm_socket.socket;
	if (g2.DEBUG>0) console.log(dm_socket);

	automation_q_dosend(dm,socket);
};

function getuid(socket) {
  var uid=socket?socket.id:'mpxg2';
  return uid;
};

function automation_q_dosend(dm,socket) {
  var uid=getuid(socket);
	var od=g2.config.objectDescription[dm.curLevel.objectType];
	var val;
	if (od.dataSize==1) {
		val=dm.data[0];
	} else if (od.dataSize==2) {
		val=dm.data[0]+(dm.data[1]<<8);
	} else if (od.displayUnits[0]==0x30) {
		val=dm.data.toString().trim();	
	};

	if (g2.DEBUG>0) console.log(dm,od,val);

	var addr='';
	for (var i=0; i<dm.numLevels; ++i) {
		addr+=printf('%02X',dm.levels[i]);
	};

	var script='';

	if (dm.path=="Program.Misc.PrgSelect") {
    usedSteps='?';
    g2.getUsedSteps(usedSteps_update);
		script+='program_change('+val+');';
		g2.patching_destinations_to_be_rebuild=true;
		//disable_automation=true;
		//g2.patching_destinations_rebuild(function(){
		//	disable_automation=false;
		//});

	} else if (dm.numLevels==2) {

		dm.levels[2]=dm.data[0];
		if (dm.automation==true) {
			var L='';
			for (var i=0; i<3; ++i) {
				L+=printf('%02X',dm.levels[i]);
			};
      script="algorithm_change('"+L+"');";
			if (socket) {
        socket.broadcast.emit('automation',script); 
      } else {
        for (var uid in automation_pb) {
          automation_pb[uid].emit('automation',script);
        }
      }
      return;
		};

		var html='';
		loop(3,3,dm.levels,html,function(html){
			script+="ul=$('li[data-level^=L"+addr+"]:first').parent();"
			script+="if (ul.size()) {";
			script+="  ul.html('"+html+"');";
			script+="  $('td.column.primary ul').listview('refresh');";
			script+="  $('.ui-page').trigger('pagecreate')";
			script+="}";

			if (socket) {
        socket.emit('automation',script);
      }
		});
		return;

	} else {
		if (od.displayUnits[0]&0x8000) {
			if (od.dataSize==1 && val&0x80) {
				val=-(256-val);
			} else if (od.dataSize==2 && val&0x8000) {
				val=-(65536-val);
			}
		};

		switch(od.optionType) {
			case 0x133: 
				script+="$('select[name=\"a"+addr+"\"]').data('noMessage',true).val("+dm.data[1]+").change();";
				script+="$('input[name=\"a"+addr+"\"]').data('noMessage',true).val("+val+").change();";
				break;

			case 0x12c:
				switch(od.objectType) {
					case 0x33: 
						script+="$('input[name=\"a"+addr+"\"]').data('noMessage',true).val("+dm.data[1]+").change();";
						script+="$('select[name=\"a"+addr+"\"]').data('noMessage',true).val("+val+").change();";
						break;

					default:
						script+="$('input[name=\"a"+addr+"\"]:first').data('noMessage',true).val("+dm.data[2]+").change();";
						script+="$('input[name=\"a"+addr+"\"]:last').data('noMessage',true).val("+val+").change();";
						break;
				};

				break;

			case 0x12d:
			case 0x12e:
			case 0x13a:
				script+="$('input[name=\"a"+addr+"\"]:first').data('noMessage',true).val("+dm.data[1]+").change();";
				script+="$('input[name=\"a"+addr+"\"]:last').data('noMessage',true).val("+dm.data[0]+").change();";
				break;

			case 0x12f:
			case 0x130:
			case 0x131:
			case 0x135:
				script+="if (!param_update('"+addr+"',"+od.optionType+","+dm.data[2]+")) {";
				if(dm.data[2]==1) {
						script+="$('input#a"+addr+"-0').data('noMessage',true).val('"+dm.data[0]+"').change();"
						script+="$('input#a"+addr+"-1').data('noMessage',true).val('"+dm.data[1]+"').change();"
				} else {
						script+="$('input#a"+addr+", select#a"+addr+"').data('noMessage',true).val('"+val+"').change();"
				};
				script+='}';
				break;

			case 0x132:
			case 0x136:
				script+="if (!param_update('"+addr+"',"+od.optionType+","+dm.data[2]+")) {";
				if(dm.data[2]==1) {
						script+="$('input#a"+addr+"-0').data('noMessage',true).val('"+dm.data[0]+"').change();"
						script+="$('input#a"+addr+"-1').data('noMessage',true).val('"+dm.data[1]+"').change();"
				} else {
						script+="$('input#a"+addr+"').data('noMessage',true).val('"+val+"').change();"
				};
				script+='}';
				break;

			case 0xffff:
				script+="$('input#a"+addr+", select#a"+addr+"').data('noMessage',true).val('"+val+"').change();"
				script+="$('[for=\"'+$('input[name=\"a"+addr+"\"][type=\"radio\"][value="+val+"]').data('noMessage',true).attr('id')+'\"]').click();";
				//script+="$('#a"+addr+"-button .ui-btn-text').text($('select#a"+addr+" option[value="+val+"]').text());";
				break;

			case 0x134: 
				script+="$('input#a"+addr+", select#a"+addr+"').data('noMessage',true).val('"+dm.data[0]+"').change();"
				script+="$('[for=\"'+$('input[name=\"o"+addr+"\"][type=\"radio\"][value="+dm.data[1]+"]').data('noMessage',true).attr('id')+'\"]').click();";
				break;

			case 0x139: 
				val=dm.data[0]?-(256-dm.data[0]):0;
				script+="$('input#a"+addr+", select#a"+addr+"').data('noMessage',true).val('"+val+"').change();"
				script+="$('[for=\"'+$('input[name=\"o"+addr+"\"][type=\"radio\"][value="+(dm.data[1]-1)+"]').data('noMessage',true).attr('id')+'\"]').click();";
				break;

			case 0x13b:
				var dry=0;
				if (dm.data[0]&0x80) {
					dry=1;
					val=-(256-dm.data[0]);
				};
				script+="if (!param_update('"+addr+"',"+od.optionType+","+dry+")){";
				script+="$('input#a"+addr+", select#a"+addr+"').data('noMessage',true).val('"+val+"').change();"
				script+="$('[for=\"'+$('input[name=\"o"+addr+"\"][type=\"radio\"][value="+dry+"]').data('noMessage',true).attr('id')+'\"]').click();";
				script+='};';
				break;

			default:
				if (g2.DEBUG>0) console.log(od,dm,val);
				console.log('automation: unhandled optionType',od.optionType.toString(16));
				process.exit(0);

		} // switch(od.optionType)
	};

  if (g2.DEBUG) console.log('automation for !'+uid, script);
	if (socket) {
    socket.broadcast.emit('automation',script);
  } else {
    for (var uid in automation_pb) {
      automation_pb[uid].emit('automation',script);
    }
  }
};

function loop(base,numLevels,levels,html,callback,unique) {
	
	controlTree=g2.config.controlTree;
	objectDescription=g2.config.objectDescription;

	var od=objectDescription[g2.getLevel(numLevels,levels).objectType];
	if (od.isControlLevel) {
		if (numLevels!=base || (numLevels==3 && levels[0]==0 && levels[1]<7)) {
			html+=controlTree_gui(numLevels,levels,od);
		};
		levels[numLevels]=od.minValue[0];
		loop(base,numLevels+1,levels,html,function(html){
			if (numLevels==base) {
				callback(html);
			} else {
				++levels[numLevels-1];
				 if (levels[numLevels-1]<=objectDescription[g2.getLevel(numLevels-1,levels).objectType].maxValue[0]) {
					loop(base,numLevels,levels,html,callback);
				 } else {
					 callback(html);
				 }
			}
		});

	} else {
		g2.dataMessage_request(numLevels,levels,function(dm){
			html+=controlTree_gui(numLevels,levels,od,dm.data);
			++levels[numLevels-1];	
			if (!unique && levels[numLevels-1]<=objectDescription[g2.getLevel(numLevels-1,levels).objectType].maxValue[0]) {
				loop(base,numLevels,levels,html,callback);
			} else {
				callback(html);
			};
			return false;
		});
	}
};

var automationTimeout;
this.GET=function(pb) {

  if (g2.DEBUG) console.log(pb.url);

	var html;
	controlTree=g2.config.controlTree;
	objectDescription=g2.config.objectDescription;

	switch(pb.url.pathname) {
		/*
		case '/eval':
			eval('try{eval(pb.url.query.js)} catch(e) {console.log(e)}');
			pb.response.end('');
			return;
		*/

		case '/index.html':
			if (g2.buildingControlTree) {
				pb.response.end(wait_html);
				return;
			}

			html=':&nbsp;';
			var download_chrome=(/MSIE/.test(pb.request.headers['user-agent']))?'block':'none';

			if (self.http.URLs.length>1) {
				html='s'+html;
			}

			self.http.URLs.forEach(function(val){
				html+='<br /><a href="'+val+'">'+val+'</a>';
			});
			pb.response.end(home.replace('URL','URL'+html).replace('DOWNLOAD_CHROME',download_chrome));
			return;

    case '/programs.html':
      var html='<li>';
      for (var hash in global_library.program) {
        var prog=global_library.program[hash];
        //program change?
       // html+='<li><a href="program.html?hash='+hash+'">'+(prog.no?'<span>'+prog.no+' - </span>':'')+prog.name+'</a></li>';
        html+='<input type="checkbox" id="'+hash+'" name="program"><label for="'+hash+'">'+(prog.no?'<span>'+prog.no+' - </span>':'')+prog.name+'</label>';
      }
      html+='</li>';
      pb.response.end(programs.replace('PROGRAMS',html));
      return;

    case '/led':
      var levels=g2.getLevelsByName('System.Panel.PanelLEDs');
      g2.dataMessage_request(levels.length,levels,function(dm){
        console.log(dm);
        pb.response.end(JSON.stringify(dm));
      });
      return;

		case '/dump':
      if (pb.url.query.what=='all_programs') {
        all_programs_dump(0,function(abort){
          var sysex=[];
          g2.all_programs_bank.forEach(function(val,i){
            sysex=sysex.concat(bufferToArray(val.raw));
            /*
              sysex.concat([0xF0,g2.COMPANY_ID,g2.PRODUCT_ID,g2.DEVICE_ID])
              .concat(g2.nibblize16(val.data.length))
              .concat(bufferToArray(val.data))
              .concat([0x04,0x00,0x00,0x00])
              .concat(g2.getProgramAddr(i))
              .concat([0xF7]);
              */
          });

          if (sysex.length) {
  					pb.response.writeHead(200, {
  						'Content-Type': 'application/octet-stream',
  						'Content-Length': sysex.length,
  						'Content-Disposition': 'attachment; filename=All_Programs.syx'
  					});
  					pb.response.end(new Buffer(sysex),'binary');
          } else {
            pb.response.end(file.readFile('nothing_to_dump.html'));
          }
        });
        return;
      };

			if (pb.url.query.list) {
				var list=true;
			};

			g2.programDump(pb.url.query.p,function(dataMessage){
				var programNumber=g2.parseProgramAddr(dataMessage.numLevels,dataMessage.levels);
				var programName=g2.getProgramName(dataMessage.data);
        if (programName.length==0) {
          pb.response.end(file.readFile('nothing_to_dump.html'));
          return false;
        } 

				if (g2.DEBUG>0) console.log('program number:',programNumber);
				var bank=(programNumber<251)?'system':'user';
        dataMessage_process(dataMessage);
				if (list) {
					if (programNumber<250 || (programNumber>250 && programNumber<300)) {
						process.nextTick(function(){
							pb.url.query.p=parseInt(pb.url.query.p)+1;
							self.GET(pb);
						});

					} else {
						pb.response.end('ok');
					}

				}  else {
					var sysex=new Buffer(
						[0xF0,g2.COMPANY_ID,g2.PRODUCT_ID,g2.DEVICE_ID,g2.message_type.DATA]
						.concat(g2.nibblize16(dataMessage.data.length))
						.concat(g2.nibblize(dataMessage.data))
						.concat([0x04,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x0A,0x00,0x00,0x00,0x02,0x00,0x00,0x00,0x04,0x06,0x00,0x00,0xF7]) /* Current program */
					);

					pb.response.writeHead(200, {
						'Content-Type': 'application/octet-stream',
						'Content-Length': sysex.length,
						'Content-Disposition': 'attachment; filename='+programName.replace(/ /g,'_')+'.syx'
					});
					pb.response.end(sysex,'binary');
				}
        return false;
			});
			return;
/*
		case '/automation':
			if (g2.DEBUG>0) console.log(pb.url);
			automationq_send(pb);
			return;
*/

		case '/help':
			if (g2.DEBUG>0) console.log(pb.url);
			var levels=levels_parse(pb.url.query.p);
			var path=g2.getLevelName(levels.length,levels);
			var info=(path)?g2.info[path.toLowerCase()]:{man: 0};

			if (info){
				var pageTitle="Manual - Page "+info.man;
				html='<td class="column secondary">'+secondary[levels[0]]+'</td><td class="column primary">'+manPage.replace(/MANPAGE/,printf("%03d",info.man))+'</ul></td>';
				pb.response.end(data1b.replace(/TITLE/g,pageTitle).replace(/CACHE/,'no').replace(/MANPAGE/,'0')+html+'</tr></table></div></div></body></html>');
			} else {
				var pageTitle="Manual - Page 0";
				html='<td class="column secondary">'+secondary[levels[0]]+'</td><td class="column primary">'+manPage.replace(/MANPAGE/,printf("%03d",0))+'</ul></td>';
				pb.response.end(data1b.replace(/TITLE/g,pageTitle).replace(/CACHE/,'no').replace(/MANPAGE/,'0')+html+'</tr></table></div></div></body></html>');
			};
			return;

		case '/config.html':
			var count=g2.midiin.getPortCount();
			var midi_inputs='';
			for (var i=0; i<count; ++i) {
				midi_inputs+='<input type="radio" name="midiin" id="midiin-'+i+'" value="'+i+'"'+(i==g2.getPortByName(g2.midiin,g2.MIDI_INPUT)?'checked="checked"':'')+'>';
				midi_inputs+='<label for="midiin-'+i+'">'+g2.midiin.getPortName(i)+'</label>';
			};
			count=g2.midiout.getPortCount();
			var midi_outputs='';
			for (var i=0; i<count; ++i) {
				midi_outputs+='<input type="radio" name="midiout" id="midiout-'+i+'" value="'+i+'"'+(i==g2.getPortByName(g2.midiout,g2.MIDI_OUTPUT)?'checked="checked"':'')+'>';
				midi_outputs+='<label for="midiout-'+i+'">'+g2.midiout.getPortName(i)+'</label>';
			};

			pb.response.end(confightml.replace(/midi_inputs/,midi_inputs).replace(/midi_outputs/,midi_outputs).replace(/_deviceID_/,prefs.deviceID));
			return;

		case '/midiin':
			var portName=decodeURIComponent(pb.url.query.name);
      if (g2.MIDI_INPUT==portName) {
        pb.response.end('1');
        return;
      };

			try {
				g2.midiin.closePort();
			} catch(e) {
				console.log(e);
			};

			var portNum=g2.getPortByName(g2.midiin,portName);
			try {
				g2.midiin.openPort(portNum);
			} catch(e) {
				console.log(e);
				pb.response.end('0');
				return;
			};
			g2.MIDI_INPUT=portName;
      prefs['midiin']=portName;
			pb.response.end('1');
      prefs_save();
			return;

		case '/midiout':
			var portName=decodeURIComponent(pb.url.query.name);
      if (g2.MIDI_OUTPUT==portName) {
        pb.response.end('1');
        return;
      };

			try {
				g2.midiout.closePort();
			} catch(e) {
				console.log(e);
			};

			var portNum=g2.getPortByName(g2.midiout,portName);
			try {
				g2.midiout.openPort(portNum);
			} catch(e) {
				console.log(e);
				pb.response.end('0');
				return;
			};
			g2.MIDI_OUTPUT=portName;
      prefs['midiout']=portName;
			pb.response.end('1');
      prefs_save();
			return;

    case '/deviceID':
      prefs.deviceID=pb.url.query.id;
      g2.DEVICE_ID=prefs.deviceID;
      prefs_save();
			pb.response.end('');
      return;
	};

	var L=pb.url.pathname.replace(/\/([0-9A-F]+)\.html/,"$1");
	if (L.length==4) {

		pb.response.writeHead(200,{
			'Cache-control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
		});

		ctgui_ref={
			numLevels: undefined,
			levels: undefined,
			label: undefined,
			index: 1
		};

		var levels=[parseInt(L.substr(0,2),16), parseInt(L.substr(2,2),16)];
		var html='<ul data-role="listview" data-theme="c" data-dividertheme="b" data-inset="false" data-toplevel="L'+L+'">';
		var pageTitle=od=objectDescription[g2.getLevel(2,levels).objectType].name.trim();
    if (levels[0]==0) {
      pageTitle=pageTitle;
    }

		// effect ?
		if (levels[0]==0 && levels[1]<7) {
			// check current algorithm
			disable_automation=true;
			g2.dataMessage_request(2,levels,function(dm){
				levels[2]=dm.data[0];
				loop(3,3,levels,html,function(html){
					html='<td class="column secondary">'+secondary[levels[0]]+'</td><td class="column primary">'+html+'</ul></td>';
					var page=data1b.replace(/TITLE/g,pageTitle).replace(/CACHE/,'no').replace(/MANPAGE/,L+printf('%02d',levels[2]))+html+data2b.replace('href="'+L,'class="effect-current ui-btn-active ui-state-persist" href="'+L);
					if (g2.DEBUG>0) console.log(page);
					pb.response.end(page);
					process.nextTick(function(){
						disable_automation=false;
					});
				});
				return false;
			});

		} else {
			loop(2,2,levels,html,function(html){
				html='<td class="column secondary">'+secondary[levels[0]]+'</td><td class="column primary">'+html+'</ul></td>';
				pb.response.end(data1b.replace(/TITLE/g,pageTitle).replace(/CACHE/,'no').replace(/MANPAGE/,L)+html+data2b);
			});
		};
		return;
	};
	GET(pb);
};

this.POST=function(pb) {

  if (g2.DEBUG) console.log(pb.url);

  switch(pb.url.pathname) {

    case '/upload':
      form.receive(pb.request,function(formData){
        if (g2.DEBUG) console.log(JSON.stringify(formData));
        //pb.response.end(JSON.stringify(formData));
        pb.response.end(JSON.stringify({
          script: (function() {
                  }).toString()
        }));

        formData.forEach(function(item,i){
          if (!item.form_data || !item.form_data.body) {
            return;
          }
          console.log(item.form_data.body.length);
          var data=item.form_data.body;
          switch (item.headers['content-type']) {
            case 'application/octet-stream':
              break;

            case 'text/plain':
              var buf=[];
              for (var i=0; i<data.length; i+=2) {
                buf.push(parseInt(String.fromCharCode(data[i])+String.fromCharCode(data[i+1]),16));
              }
              data=buf;
              console.log(buf);
              break;

            default:
              console.log(item.headers['content-type']+': unhandled file upload');
              return;

          }
          if (data[0]==0xF0 && data[data.length-1]==0xF7) {
            g2.midi_message({
              raw: true,
              data: data
            });
          }
        });
      });
      return;

    /*default:
      POST(pb);
      return;
      */
  } 
}


try {
  global_library=JSON.parse(file.readFile('library.mpx'));
} catch(e) {
  console.log(e);
}

var toolbar=file.readFile('toolbar.html');
var wait_html=file.readFile('wait.html');
var manPage=file.readFile('manpage.html').replace('TOOLBAR',toolbar);
var home=file.readFile('index.html').replace('TOOLBAR',toolbar);
var programs=file.readFile('programs.html').replace('TOOLBAR',toolbar);
var data1=file.readFile('template_top.html').replace('TOOLBAR',toolbar);
var data2=file.readFile('template_bottom.html');
var data1b=file.readFile('template_top2.html').replace('TOOLBAR',toolbar);
var data2b=file.readFile('template_bottom2.html');
var confightml=file.readFile('config.html').replace('TOOLBAR',toolbar);
var secondary=[];
secondary[0]=file.readFile('00_options.html');
secondary[1]=file.readFile('01_options.html');

function mpx_controlTree_gui(mpx) {

	controlTree=g2.config.controlTree;
	objectDescription=g2.config.objectDescription;
	for (var a=objectDescription[controlTree.objectType].minValue[0];a<=objectDescription[controlTree.objectType].maxValue[0];++a) {
		controlTree[a].html='';
		// effect blocks
		var oda=objectDescription[controlTree[a].objectType];
		for (var i=oda.minValue[0]; i<=oda.maxValue[0]; ++i) {
			var od=objectDescription[controlTree[a][i].objectType];
			var blockName=od.name.trim();
			var name=blockName.toLowerCase().replace(/ /g,'_');
			var li='<li><a href="'+printf('%02X%02X',a,i)+'.html">'+blockName+'</a></li>';
			// algorithms
			controlTree[a][i].html='';
			if (od.isControlLevel) {
				for (var j=od.minValue[0]; j<=od.maxValue[0]; ++j) {
					var odj=objectDescription[controlTree[a][i][j].objectType];
					controlTree[a][i].html+=controlTree_gui(3,[a,i,j],odj);
					// parameters
					if (odj.isControlLevel) {
						controlTree[a][i][j].html='';
						for (var k=odj.minValue[0]; k<=odj.maxValue[0]; ++k) {
							var odk=objectDescription[controlTree[a][i][j][k].objectType];
							var html=controlTree_gui(4,[a,i,j,k],odk);
							controlTree[a][i].html+=html;
							controlTree[a][i][j].html+=html;
							if (odk.isControlLevel) {
								controlTree[a][i][j][k].html='';
								for (var n=odk.minValue[0]; n<=odk.maxValue[0]; ++n) {
									var odn=objectDescription[controlTree[a][i][j][k][n].objectType];
									html=controlTree_gui(5,[a,i,j,k,n],odn);
									controlTree[a][i].html+=html;
									controlTree[a][i][j][k].html+=html;
								}
							}
						}
					}
				}
			};

			if (/<input/.test(controlTree[a][i].html)) {
				fs.writeFile('./www/'+printf('%02X%02X',a,i)+'.html',data1+controlTree[a][i].html+data2);
				controlTree[a].html+=li;
			}
		};
		fs.writeFile('./www/'+printf('%02X',a)+'.html',data1+controlTree[a].html+data2);
	}
};

var blacklist=[
  'Program.Misc.Effstatus',
  'Program.Misc.PrgSelect',
  'Program.Misc.ClearReg',
  'Program.Misc.SaveProg',
	'System.Setup.SetupSel',
	'System.Setup.SetupSave',
	'System.Setup.Initialize',
	'System.Setup.RunTime',
	'System.MIDI.SysexOnOFF',
	'System.MIDI.DeviceID',
	'System.MIDI.Dump',
	'System.MIDI.Renumber',
];

var ctgui_ref={
	numLevels: undefined,
	levels: undefined,
	label: undefined,
	index: 1
};

function controlTree_gui(numLevels,levels,od,value,isOption,objVal){
  var path=g2.getLevelName(numLevels,levels);
	if (blacklist.indexOf(path)!=-1) {
		return '';
	};

	controlTree=g2.config.controlTree;
	objectDescription=g2.config.objectDescription;
	var name=od.name.trim();
	if (name=='null') 
		return '';

	var html='';
	var L=g2.toL(numLevels,levels);

	if (od.isControlLevel) {
		if (numLevels==3 && levels[0]==0 && levels[1]<7) {
			// algorithm select
			var AL=L.substr(0,4);
			var curLevel=g2.getLevel(2,levels);
			html='<label for="a'+AL+'" class="select">Algorithm</label>';
			html+='<select name="a'+AL+'" class="_select" id="a'+AL+'" '+native_menus+' data-menu-dialog="true" onchange="select_change">';
      var info=g2.info[g2.getLevelName(3,levels).toLowerCase()];
      var curSteps=(info && info.steps)?parseInt(info.steps,10):0;
			for(i=0;i<=objectDescription[curLevel.objectType].maxValue[0];++i){
				var _name=objectDescription[curLevel[i].objectType].name.trim();
        if (levels[1]!=4 && levels[1]!=6 && i>0) while(_name.length<12) _name+='_';
        var selected=(i==levels[2]);
        info=g2.info[g2.getLevelName(3,[levels[0],levels[1],i]).toLowerCase()];
        var enough=(info && info.steps)?((g2.processingStepsAvail-parseInt(usedSteps,10)+curSteps)<parseInt(info.steps,10)?' disabled ':' '):' ';
        var steps=(info && info.steps)?' [ '+info.steps+(selected?'':(usedSteps=='?'?'':' / '+(g2.processingStepsAvail-usedSteps+curSteps)))+' ]':'';
				html+='<option'+enough+'value="'+i+'"'+(selected?' selected':'')+'>'+_name+steps+'</option>';
			};
			html+='</select>';
//			html+='<div><a href="/help?p='+printf('%06X',(levels[0]<<12)+(levels[1]<<8)+levels[2])+'" data-role="button" data-inline="true" data-icon="info" data-iconpos="notext" class="algo-info">Help</a></div>';
		} else {
			function levels_compare(a,b,n) {
				for (var i=0; i<n; ++i)
					if (a[i]!=b[i]) {
						return false;
					};
				return true;
			};

			var label=od.name.trim();
			if (label==ctgui_ref.label && numLevels==ctgui_ref.numLevels && levels_compare(levels,ctgui_ref.levels,numLevels-1)) {
				if (ctgui_ref.index==1) {
					// insert "1" after first label
				};
				++ctgui_ref.index;
				label=label+' '+ctgui_ref.index;
			} else {
				ctgui_ref={
					numLevels: numLevels,
					levels: levels,
					label: label,
					index: 1
				}
			};

			html='<div class="controlLevel">'+label+'</div>';
			//html='<div class="controlLevel-'+levels.length+'">'+label+'</div>';
		}

	} else {

		if (!objVal) {
			objVal=g2.getObjectValue(od,value);
			if (od.optionType!=0xffff) {
				html=controlTree_gui(numLevels,levels,g2.config.objectDescription[od.optionType],objVal.optionValue,true,objVal);
			}
		};

		var curL=g2.getLevel(numLevels,levels);
		var displayUnits=(g2.DEBUG?(curL.ok?'':'<i>')+printf(' %04X ',od.displayUnits[0])+(curL.ok?'':'</i>'):'');
		if (isOption&&objVal.optionLabel&&typeof(objVal.optionLabel)=='object') { // option
			if (objVal.optionLabel.length<3) {
				html+='<fieldset class="option f'+L+'" data-unit="'+objVal.optionValue+'" data-role="controlgroup" data-type="horizontal">';
				html+='<legend>'+od.name.trim()+displayUnits+'</legend>';
				objVal.optionLabel.forEach(function(label,i){	
					html+='<label for="o'+L+'-'+i+'">'+label+'</label>';
					html+='<input type="radio" name="o'+L+'" id="o'+L+'-'+i+'" value="'+i+'"'+(objVal.optionValue==i?' checked="checked"':'')+' />';
				});
				html+='</fieldset>';
			} else if (objVal.optionLabel.length<5) {
				html+='<fieldset class="option f'+L+'" data-unit="'+objVal.optionValue+'" data-role="controlgroup">';
				html+='<legend>'+od.name.trim()+displayUnits+'</legend>';
				objVal.optionLabel.forEach(function(label,i){	
					html+='<label for="o'+L+'-'+i+'">'+label+'</label>';
					if (objVal.optionValue==i) {
						html+='<input type="radio" name="o'+L+'" id="o'+L+'-'+i+'" value="'+i+'" checked>';
					} else {
						html+='<input type="radio" name="o'+L+'" id="o'+L+'-'+i+'" value="'+i+'">';
					}
				});
				html+='</fieldset>';
			} else {
				html+='<fieldset class="option f'+L+'" data-unit="'+objVal.optionValue+'">';
				html+='<label for="a'+L+'" class="select">'+od.name.trim()+displayUnits+'</label>';
				html+='<select name="a'+L+'" class="_select" id="a'+L+'" '+native_menus+' onchange="select_change">';
				var current=objVal.optionLabel[objVal.optionValue];
				objVal.optionLabel.forEach(function(label,i){
					if (current==label) {
						html+='<option value="'+i+'" selected>'+label+'</option>';
					} else {
						html+='<option value="'+i+'">'+label+'</option>';
					}
				});
				html+='</select>';
				html+='</fieldset>';
			}


		} else if (!isOption && objVal.unitLabel && typeof(objVal.unitLabel)=='object') { // textual value
			if (objVal.unitLabel.length<3) { 
				html+='<fieldset class="mainValue" data-role="controlgroup" data-type="horizontal">';
    				html+='<legend>'+od.name.trim()+displayUnits+'</legend>';
				for (var i=od.minValue[0]; i<=od.maxValue[0] && i<objVal.unitLabel.length; ++i) {

					html+='<label for="a'+L+'-'+i+'">'+objVal.unitLabel[i]+'</label>';
					if (i==objVal.val) {
						html+='<input type="radio" name="a'+L+'" id="a'+L+'-'+i+'" value="'+i+'" checked>';
					} else {
						html+='<input type="radio" name="a'+L+'" id="a'+L+'-'+i+'" value="'+i+'">';
					}

				};
				html+='</fieldset>';
			} else if (objVal.unitLabel.length<6) { // || od.displayUnits[0]==0x5e /*speakersim*/ || od.objectType==0xe5 /*onsrc*/) { 
				html+='<fieldset class="mainValue" data-role="controlgroup">';
				html+='<legend>'+od.name.trim()+displayUnits+'</legend>';
				for (var i=od.minValue[0]; i<=od.maxValue[0] && i<objVal.unitLabel.length; ++i) {
					html+='<label for="a'+L+'-'+i+'">'+objVal.unitLabel[i]+'</label>';
					if (i==objVal.val) {
						html+='<input type="radio" name="a'+L+'" id="a'+L+'-'+i+'" value="'+i+'" checked>';
					} else {
						html+='<input type="radio" name="a'+L+'" id="a'+L+'-'+i+'" value="'+i+'">';
					}
				};
				html+='</fieldset>';
			} else {
				html+='<fieldset class="mainValue">';
				html+='<label for="a'+L+'" class="select">'+od.name.trim()+displayUnits+'</label>';
				html+='<select name="a'+L+'" class="_select" id="a'+L+'" '+native_menus+' onchange="select_change">';
				var first=true;
				var label;
				for (var i=od.minValue[0]; i<=od.maxValue[0] && i<objVal.unitLabel.length; ++i) {
					label=objVal.unitLabel[i];
					if (first) {
						if (od.displayUnits[0]==0x29||od.displayUnits[0]==0x28) {
							label='None';
						};
						first=false;
					};
					if (i==objVal.val) {
						html+='<option value="'+i+'" selected>'+label+'</option>';
					} else {
						html+='<option value="'+i+'">'+label+'</option>';
					}
				};
				html+='</select>';
				html+='</fieldset>';
			}


		} else if(od.minValue[objVal.unit]==0 && od.maxValue[objVal.unit]==1) { // on-off
			var min=od.minValue[objVal.unit]&0xff;
			var max=od.maxValue[objVal.unit]&0xff;
			html+='<fieldset class="'+(isOption?'option':'mainValue')+'" data-role="controlgroup" data-type="horizontal">';
			html+='<legend>'+od.name.trim()+displayUnits+'</legend>';
			html+='<label for="a'+L+'-2">On</label>';
			html+='<input type="radio" name="a'+L+'" id="a'+L+'-2" value="'+max+'"'+(objVal.val==max?' checked="checked"':'')+' />';
			html+='<label for="a'+L+'-1">Off</label>';
			html+='<input type="radio" name="a'+L+'" id="a'+L+'-1" value="'+min+'"'+(objVal.val==min?' checked="checked"':'')+' />';
			html+='</fieldset>';

////			html+='<label for="a'+L+'">'+od.name.trim()+(objVal.unitLabel?' ('+objVal.unitLabel+')':'')+'</label><select class="toggle" name="a'+L+'" id="a'+L+'" data-role="slider"><option value="0">Off</option><option value="1">On</option></select>';

//			html+='<input type="checkbox" name="checkbox-'+L+'" id="checkbox-'+L+'" class="custom" '+(val?'checked ':'')+'/> <label for="checkbox-'+L+'">'+od.name.trim()+'</label>';
		} else if (od.minValue[objVal.unit]==0 && od.maxValue[objVal.unit]==0) {
			return '';
		} else {
			if (objVal.twoValues) {
				var min=od.minValue[objVal.unit]>>8;
				var max=od.maxValue[objVal.unit]>>8;
				if (g2.DEBUG>0) console.log(objVal);
				html+='<div class="mainValue firstfield"><label for="a'+L+'-0">'+od.name.trim()+' ('+objVal.unitLabel.split(':')[0]+')</label> <input type="range" name="a'+L+'-0" id="a'+L+'-0" value="'+value[0]+'" min="'+min+'" max="'+max+'"  /></div>';
				min=od.minValue[objVal.unit]&0xff;
				max=od.maxValue[objVal.unit]&0xff;
				html+='<div class="mainValue secondfield"><label for="a'+L+'-1">'+od.name.trim()+' ('+objVal.unitLabel.split(':')[1]+')</label> <input type="range" name="a'+L+'-1" id="a'+L+'-1" value="'+value[1]+'" min="'+min+'" max="'+max+'"  /></div>';


			} else {
				if (isOption) {
					var min=od.minValue[objVal.optionUnit];
					var max=od.maxValue[objVal.optionUnit];
					if (min==undefined) {
						console.log('min undefined for ',L);
						process.exit(0);
					};

					html+='<div class="option"><label for="a'+L+'">'+od.name.trim()+(objVal.optionUnitLabel?' ('+objVal.optionUnitLabel+')':'')+'</label> <input type="range" name="a'+L+'" id="a'+L+'" value="'+objVal.optionValue+'" min="'+min+'" max="'+max+'"  /></div>';
				} else {
					switch(od.displayUnits[0]){
						case 0x30: // name
							html+='<div class="mainValue"><label for="a'+L+'">'+od.name.trim()+'</label> <input type="text" maxlength="'+od.dataSize+'" name="a'+L+'" id="a'+L+'" value="'+objVal.val.trim()+'" /></div>';
							break;
						default:
							var min=od.minValue[objVal.unit];
							var max=od.maxValue[objVal.unit];
							html+='<div class="mainValue"><label for="a'+L+'">'+od.name.trim()+displayUnits+(objVal.unitLabel?' ('+objVal.unitLabel+')':'')+'</label> <input type="range" name="a'+L+'" id="a'+L+'" value="'+objVal.val+'" min="'+min+'" max="'+max+'" /></div>';
							break;
					}
				}

			}
		}

	};
	return od.optionType==0xffff?'<li data-role="fieldcontain"'+(g2.DEBUG?' title="'+path+'"':'')+'" data-level="L'+L+'">'+html+(objVal?'':'</li>'):html+'</li>';
};

init();

function terminalDisplay_enable() {
	g2.dataMessage(3,[1,0x12,3],1);
};

function json_save(path,obj) {
  try {
    fs.writeFileSync(path,JSON.stringify(obj));
  } catch(e) {
    console.log(path+': write error');
  }
};

function json_load(path){
  try {
     return JSON.parse(fs.readFileSync(path));
  } catch(e) {
    console.log(path+': read error');
  }
};

function prefs_save() {
  json_save('mpxg2edit.ini',prefs);
}

function prefs_load() {
  var _prefs=json_load('mpxg2edit.ini');
  if (_prefs) {
    prefs=_prefs;
  }
}

function all_programs_dump(already,callback) {
  g2.dataMessage('System.Panel.PnlButton',0x0b);
  g2.dataMessage('System.Panel.PnlButton',0x37);
  g2.dataMessage('System.Panel.PnlButton',0x0b);
  g2.dataMessage('System.Panel.PnlButton',0x37);
  g2.dataMessage_request('System.Panel.PnlDisply',function(dm){
    var expected=[0x53,0x79,0x73,0x74,0x65,0x6d,0x20,0x73,0x65,0x6c,0x65,0x63,0x74,0x3a,0x20,0x01,0x1D,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x41,0x75,0x64,0x69,0x6F];
    var match=true;
    expected.forEach(function(val,i){
      //console.log(val,dm.data[i]);
      if (val!=dm.data[i]) {
        match=false;
      }
    });
    if (!match) {
      ++already;
      if (already==3) {
        console.log('all_programs_dump: Unable to reach System menu');
      } else {
        // try to quit option menu
        g2.dataMessage('System.Panel.PnlButton',0x12);
        g2.dataMessage('System.Panel.PnlButton',0x3E);
        setTimeout(function(){
          all_programs_dump(already,callback);
        },1000);
      }
      return false;
    }
    g2.dataMessage('System.Panel.PnlButton',0x42);
    g2.dataMessage('System.Panel.PnlButton',0x42);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.Panel.PnlButton',0x3D);
    g2.dataMessage('System.Panel.PnlButton',0x11);
    g2.dataMessage('System.MIDI.Dump',1);

    setTimeout(function(){
      g2.dataMessage_request('System.Panel.PnlDisply',function(dm){
      //console.log(dm);
      var expected=[0x4d,0x49,0x44,0x49,0x00,0x44,0x75,0x6d,0x70,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x1e,0x20,0x20,0x20,0x41,0x6c,0x6c,0x20,0x50,0x72,0x6f,0x67,0x72,0x61,0x6d,0x73];

      var match=true;
      expected.forEach(function(val,i){
        //console.log(val,dm.data[i]);
        if (val!=dm.data[i]) {
          match=false;
        }
      });
      if (!match) {
        ++already;
        if (already==3) {
          console.log('all_programs_dump: Unable to reach System menu');
        } else {
          all_programs_dump(already,callback);
        }
        return false;
      }
      g2.all_programs_dump_callback=callback;
      g2.all_programs_dump_timeout=setTimeout(function(){
        callback(true);
      },5000);

      g2.all_programs_bank=[];
      g2.dataMessage('System.Panel.PnlButton',0x0F);
      g2.dataMessage('System.Panel.PnlButton',0x3B);
      return false;
    });
    },1000);
    return false;
  });
}

function bufferToArray(buf) {
  var result=[];
  for (i=0; i<buf.length; ++i) {
    result.push(buf[i]);
  };
  return result;
};

var _usedSteps;
function usedSteps_update(steps) {
  if (g2.DEBUG) console.log(steps);
  _usedSteps=steps;
  usedSteps=0;
  for (effect in steps) {
    usedSteps+=steps[effect];
  }
  if (g2.DEBUG) console.log(usedSteps);
};

module.exports={
	init: init,
	g2: self.g2
};

