/*
    lexicon.js: Lexicon MPX G2 MIDI implementation 
    Copyright (C) 2011  Luc Deschenaux

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
var file=require('file');
var midi=require('midi');
var sysex=require('sysex');
var printf=require('printf');
var buffer=require('buffer');

function mpxg2(options,callback) {

	var self=this;
	this.MIDI_INPUT='';
	this.MIDI_OUTPUT='';

	this.shortAddresses_mode=0;
	this.DEBUG=0;

	this.COMPANY_ID=0x6; // LEXICON
	this.PRODUCT_ID=0xF; // MPX-G2
	this.DEVICE_ID=0x0;
	this.MAJOR_VERSION=0x1; // firmware version
	this.MINOR_VERSION=0xa;
	this.info={};
  this.processingStepsAvail=200;

	this.message_type={
		SYSTEM_CONFIGURATION: 0x0,
		DATA: 0x1,
		OBJECT_TYPE: 0x3,
		OBJECT_DESCRIPTION: 0x4,
		OBJECT_LABEL: 0x5,
		REQUEST: 0x6,
		TERMINAL: 0x11,
		HANDSHAKE: 0x12,
	};

	this.message_callback={
		1: dataMessage_parse,
		11: midiTerminalMessage_parse,
		12: handshake_parse,
  };

	this.CONFIG_FILE='';
	this.config={
		objectDescription: {},
		controlTree: {}
	};

	String.prototype.repeat = function(times) {
		return new Array(times+1).join(this);
	};

	this.getPortByName=function(iface,name) {
		var count=iface.getPortCount();
		for (var i=0; i<count; ++i) {
			if (iface.getPortName(i)==name)
				return i;
		};
		return 0;
	};

	this.midi_init=function(callback) {
		self.midiin=new midi.input();
		self.midiout=new midi.output();
		self.midiin.on('message',function(delta,chunk){
			if (self.DEBUG>0) console.log('delta',delta);
			sysex.parse(chunk,self.sysex_callback,delta);
		});
		self.midiin.ignoreTypes(false,true,true);
		try {
			self.midiin.openPort(self.getPortByName(self.midiin,self.MIDI_INPUT));
		} catch(e) {
			console.log(e);
		}
		try {
			self.midiout.openPort(self.getPortByName(self.midiout,self.MIDI_OUTPUT));
		} catch(e) {
			console.log(e);
		}
		callback();
	};

	this.sysex_hook=[];
	this.sysex_hook_add=function(options) {
		options.timestamp=new Date().getTime();
		self.sysex_hook.push(options);
		return options.timestamp;
	};

	var prevbuf={};
	this.sysex_callback=function(_buf) {

		var buf=new Buffer(_buf);
		if (buf.length>6) {
			self.dump(buf,'sysexin');
			var messageType=buf[4];
			var callback;
			if (self.DEBUG>0) console.log(self.sysex_hook);
			for (var i=0; i<self.sysex_hook.length; ++i) {
				if (self.sysex_hook[i].remove) {
					self.sysex_hook.splice(i,1);
					--i;
					continue;
				};
				var msg=self.sysex_hook[i];
				if ((msg.type==self.message_type.REQUEST && msg.request_type==messageType) || msg.type==messageType) {
					if (msg.timeout) {
						clearTimeout(msg.timeout.ref);
						msg.timeout.ref=null;
					};
					msg.remove=true;
					if (msg.callback.call(msg,buf)===false) {
						return;
					}
				}
			};

			var messageType16=buf[4].toString(16);
			if (self.DEBUG>0) {
				console.log('received sysex type:',messageType16);
			};
			var callback=self.message_callback[messageType16];
			if (callback && callback(buf)===false) {
				return;
			}
		}

	};
	
	this.dump=function(buf,what,callback) {

		var white="\x1b[37m";
		var reset="\x1b[0m";
		var diff=[];
		if (self.DEBUG>1 || self.DEBUG==-1) {

			if (what) {
				console.log(what);
				if (!prevbuf[what]) {
					prevbuf[what]=[];
				};
				var pbuf=prevbuf[what];
			};

			var line;
			var indexes='';
			for (var i=0; i<buf.length; ++i) {
				if (i%16==0) {
					if (i) console.log(line+"    "+indexes);
					line=printf('%04X',i); 
					indexes='';
				};
				if (pbuf && buf.length==pbuf.length && buf[i]!=pbuf[i]) {
					line+=' '+white+printf('%02X',buf[i])+reset;
					indexes+=' '+printf("%04X",i);
					diff.push(i);
				} else {
					line+=' '+printf('%02X',buf[i]);
				}
			};
			console.log(line+"    "+indexes);
			if (callback) callback(line);
			prevbuf[what]=buf;
		};
		if (callback) callback('');
		return diff;
	};

	// SYSTEM CONFIGURATION (00 hex)
	function systemConfiguration_request(callback) {
		self.midi_message({
			type: self.message_type.REQUEST,
			request_type: self.message_type.SYSTEM_CONFIGURATION,
			callback: function(buf) {
				return systemConfiguration_parse(buf,callback);
			},
			timeout: {
				retry: 10,
				callback: function() {
					console.log('timeout: systemConfiguration_request');
					if (this.timeout.retry>0) {
						--this.timeout.retry;
						self.midi_message(this);
					}
				}

			 }
		});
	};

	function systemConfiguration_parse(buf,callback) {
		var sc={};
		var i=5;
		sc.majorVersion=buf[i]+(buf[i+1]<<4);
		i+=2;
		sc.minorVersion=buf[i]+(buf[i+1]<<4);
		i+=2;
		var numbytes=8<<1;
		sc.timeString='';
		for (var j=i;j<i+numbytes && j<buf.length;j+=2) {
			sc.timeString+=String.fromCharCode(buf[j]+(buf[j+1]<<4));
		};
		i=j;
		var numbytes=11<<1;
		sc.dateString='';
		for (var j=i;j<i+numbytes && j<buf.length;j+=2) {
			sc.dateString+=String.fromCharCode(buf[j]+(buf[j+1]<<4));
		};
		i=j;
		sc.numberOfObjectTypes=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;
		sc.reserved=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;
		sc.numberOfControlLevels=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;

		if (self.DEBUG>0) console.log('systemConfiguration:');
		if (self.DEBUG>0) console.log(sc);
		return callback(sc);
	};

	// DATA MESSAGE (01 hex)
	this.dataMessage_request=function(numLevels,levels,callback) {
    var path;
    if (typeof(numLevels)=='string' && !callback) {
      path=numLevels;
      callback=levels;
      levels=self.getLevelsByName(path);
      numLevels=levels.length;
    } else {
		  path=self.getLevelName(numLevels,levels);
    }
		if (self.config.ready && self.alive) 
		self.midi_message({
			type: self.message_type.REQUEST,
			request_type: self.message_type.DATA,
      path: path,
			numLevels: numLevels,
			levels: levels,
			callback: function(buf) {
				return dataMessage_parse(buf,callback,this);
			},
			timeout: {
				retry: 2,
				callback: function(){
					console.log('timeout: dataMessage_request');
					if (this.timeout.retry>0) {
						--this.timeout.retry;
						self.midi_message(this);
					}
				}
				
			}
		});
		else {
			var od=self.config.objectDescription[self.getLevel(numLevels,levels).objectType];
			var dm={
				numLevels: numLevels,
				levels: levels,
        data: []
			};
			for (var i=0; i<od.dataSize; ++i) {
				dm.data.push(0);
			};
			callback(dm);
		}
	};

	function dataMessage_parse(buf,callback,msg) {

		var dm={};
		var i=5;
		var dataLength=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;

		dm.raw=buf;
		dm.data=new Buffer(dataLength);
		for (var j=0; j<dataLength; ++j) {
			dm.data[j]=buf[i]+(buf[i+1]<<4);
			i+=2;
		};
		if (self.shortAddresses_mode) {
			dm.numLevels=buf[i]+(buf[i+1]<<4);
			i+=2;
			dm.levels=[];
			for (var j=0; j<dm.numLevels; ++j) {
				dm.levels[j]=buf[i]+(buf[i+1]<<4);
				i+=2;
			}
		} else {
			dm.numLevels=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
			i+=4;
			dm.levels=[]
			for (var j=0; j<dm.numLevels; ++j) {
				dm.levels[j]=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
				i+=4;
			}
		};

		if (msg) {
      dm.path=msg.path;
      if (msg.numLevels==dm.numLevels) {
				for (var l=0; l<msg.numLevels; ++l) {
					if (msg.levels[l]!=dm.levels[l]) {
						break;
					}
				};
				if (l==msg.numLevels) {
		      if (callback) {
						if (self.DEBUG>0) console.log('call it');
						return callback(dm,msg);
		      }
				} else {
					if (self.DEBUG>0) console.log(msg.levels,dm.levels);
					if (self.DEBUG>0) console.log('pass it');
					msg.remove=false;
					return true;
				}
			} else {
				if (self.DEBUG>0) console.log(msg.levels,dm.levels);
				if (self.DEBUG>0) console.log('pass it');
				msg.remove=false;
				return true;
			}

		} else {
      dm.path=self.getLevelName(dm.numLevels,dm.levels);
    };

		if (self.DEBUG>0) console.log('process it');
		return self.dataMessage_process(dm);
	};

	this.getLevel=function(numLevels,levels) {
		var curLevel=self.config.controlTree;
		for (var j=0; j<numLevels; ++j) {
			var level=levels[j];
			if (!curLevel[level]) {
				console.log('getLevel: no such level ',level);
				console.log(numLevels,levels);
				console.trace();
				return null;
			};
			curLevel=curLevel[level];
		};
		return curLevel;
	};

	this.getLevelName=function(numLevels,levels) {
		var path=[];
		var curLevel=self.config.controlTree;
		for (var j=0; j<numLevels; ++j) {
			var level=levels[j];
			if (!curLevel[level]) {
				console.log('getLevelName: no such level ',level);
				console.log(numLevels,levels);
				return null;
			};
			curLevel=curLevel[level];
			path.push(self.config.objectDescription[curLevel.objectType].name);
		};
		return path.join('.').replace(/ /g,'');
	};

	this.dataMessage_process=function(dm) {	
		if (self.DEBUG==0) {
			return false;
		};
//		var path=self.getLevelName(dm.numLevels,dm.levels);
//		var curLevel=self.getLevel(dm.numLevels,dm.levels);
		if (dm.path) {
			console.log('incoming data message destination:',dm.path);
		};
		return false;
	};

	this.dataMessage=function(numLevels,levels,data) {
    var path;
    var type=typeof(numLevels);
		if (type=='object') {
			levels=numLevels;
			numLevels=levels.length;
			data=levels;
		} else if (type=='string' && data==undefined) {
      path=numLevels;
      data=levels;
      levels=self.getLevelsByName(path);
      numLevels=levels.length;
    }

    if (!path) {
      path=self.getLevelName(numLevels,levels);
    }

		if (typeof(data)!='object') {
			var curLevel=self.getLevel(numLevels,levels);
			if (curLevel) {
				var od=self.config.objectDescription[curLevel.objectType];
				if (self.DEBUG>0) console.log(data);
				data=parseInt(data);
				switch(od.dataSize) {
					case 1:
						data=self.nibblize(data);
						break;
					case 2:
						data=self.nibblize16(data);
						break;
					default:
						data=self.nibblize(data);
						break;
				};
				if (od.optionType!=0xFFFF) {
					var otod=od=self.config.objectDescription[od.optionType];
					console.log('missing option !',otod);
					for (var i=0; i<otod.dataSize; ++i) {
						data.push(0);
						data.push(0);
					}
				}

			} else {
				data=self.nibblize(data);
			}
		}
		var dm={
      path: path,
			numLevels: numLevels,
			levels: levels,
			type: self.message_type.DATA,
			dataSize: data.length/2,
			data: data,
		};
		self.midi_message(dm);
		return dm;
	};

	// OBJECT TYPE ID (03 hex)
	function objectTypeId_request(numLevels,levels,callback) {
		self.midi_message({
			type: self.message_type.REQUEST,
			request_type: self.message_type.OBJECT_TYPE,
			callback: function(buf) {
				return objectTypeId_parse(numLevels,levels,buf,callback);
			},
			numLevels: numLevels,
			levels: levels,
			timeout: {
				duration: 2000,
				retry: 2,
				callback: function(){
					console.log('timeout: objectTypeId_request');
					if (this.timeout.retry>0) {
						--this.timeout.retry;
						self.midi_message(this);
					}
				}
			}
		});
	};

	function objectTypeId_parse(numLevels,levels,buf,callback) {
		var i=5;
		var objectType=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;

		var curLevel=self.config.controlTree;
		for (var j=0; j<numLevels; ++j) {
			var level=levels[j];
			if (!curLevel[level]) {
				curLevel[level]={};
			};
			curLevel=curLevel[level];
		};
		if (!curLevel.objectType)
			curLevel.objectType=objectType;

		return callback(objectType);
	};

	// OBJECT DESCRIPTION (04 hex)
	function objectDescription_request(objectType,callback) {

		if (self.config.objectDescription[objectType]) {
			if (callback) {
				callback(self.config.objectDescription[objectType]);
			};
			return;
		};

		self.midi_message({
			type: self.message_type.REQUEST,
			request_type: self.message_type.OBJECT_DESCRIPTION,
			data: self.nibblize16(objectType),
			callback: function(buf) {
				return objectDescription_parse(buf,callback);
			},
			timeout: {
				retry: 2,
				callback: function() {
					console.log('timeout: objectDescription_request');
					if (this.timeout.retry>0) {
						--this.timeout.retry;
						self.midi_message(this);
					}
				}
			}
		});
	};

	function objectDescription_parse(buf,callback) {
		var i=5;
		var objectType=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;

		var od=self.config.objectDescription[objectType]={
			objectType: objectType,
		};

		var numbytes=(buf[i]+(buf[i+1]<<4))<<1;
		i+=2;
		od.name='';
		for (var j=i;j<i+numbytes && j<buf.length;j+=2) {
			od.name+=String.fromCharCode(buf[j]+(buf[j+1]<<4));
		};
		i=j;

		od.dataSize=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;
		od.controlFlags=buf[i]+(buf[i+1]<<4);
		i+=2;

		od.patchable=(od.controlFlags&1);
		od.automation=(od.controlFlags&2);
		od.isControlLevel=(od.controlFlags&4);
		od.isBottomControlLevel=(od.controlFlags&8);
		od.usesTemp=(od.controlFlags&0x10);
		od.wrapping=(od.controlFlags&0x20);
		od.softRowAssignable=(od.controlFlags&0x40);

		od.optionType=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
		i+=4;
		od.numberOfUnitsOrLimits=buf[i]+(buf[i+1]<<4);
		i+=2;

		od.minValue=[];
		od.maxValue=[];
		od.displayUnits=[];

		for (var j=0; j<od.numberOfUnitsOrLimits; ++j) {
			od.minValue[j]=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
			if (od.minValue[j]&0x8000) od.minValue[j]=-(65536-od.minValue[j]);
			i+=4;
			od.maxValue[j]=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
			if (od.maxValue[j]&0x8000) od.minValue[j]=-(65536-od.maxValue[j]);
			i+=4;
			od.displayUnits[j]=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
			i+=4;
		};

		if (self.DEBUG>2) {
			console.log(od);
		};

		return callback(od);
	};

	// OBJECT LABEL (05 hex)
	function objectLabel_request(numLevels,levels,callback) {
		self.midi_message({
			type: self.message_type.REQUEST,
			request_type: self.message_type.OBJECT_LABEL,
			numLevels: numLevels,
			levels: levels,
			callback: function(buf) {
				return objectLabel_parse(buf,callback);
			},
			timeout: {
				retry: 2,
				callback: function() {
					console.log('timeout: objectLabel_request');
					if (this.timeout.retry>0) {
						--this.timeout.retry;
						self.midi_message(this);
					}
				}
			}
		});
	};

	function objectLabel_parse(buf,callback) {

		var i=5;
		var numbytes=buf[i]<<1;
		var label='';

		for (var j=i;j<i+numbytes && j<buf.length;j+=2) {
			label+=String.fromCharCode(buf[j]+(buf[j+1]<<4));
		};
		i=j;

		var numLevels;

		if (self.shortAddresses_mode) {
			numLevels=buf[i]+(buf[i+1]<<4);
			i+=2;
		} else {
			numLevels=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
			i+=4;
		};

		var curLevel=self.config.controlTree;
		for (var j=0; j<numLevels; ++j) {
			if (self.shortAddresses_mode) {
				var level=buf[i]+(buf[i+1]<<4);
				i+=2;
			} else {
				var level=buf[i]+(buf[i+1]<<4)+(buf[i+2]<<8)+(buf[i+3]<<12);
				i+=4;
			};

			if (!curLevel[level]) {
				curLevel[level]={};
			};
			curLevel=curLevel[level];
		};
		curLevel.label=label;
		return callback(label);
	};

	// MIDI TERMINAL MESSAGE (11 hex)
	function midiTerminalMessage_parse(buf) {
		var i=5;
		var numbytes=(buf[i]+(buf[i+1]<<4))<<1;
		i+=2;
		var message='';
		for (var j=i;j<i+numbytes && j<buf.length;j+=2) {
			message+=String.fromCharCode(buf[j]+(buf[j+1]<<4));
		};
		i=j;
		console.log('midi terminal message: '+ message);
	};

	// HANDSHAKING (12 hex)

	var handshake_message=[
		"No Operation",
		"Are you There",
		"I'm Alive",
		"I'm Busy. Please wait",
		"I'm ready",
		"Error. Re-send data",
		"Enable Small (8 bit) address mode",
		"Enable Large (16 bit) address mode",
		"Transmit control tree",
		"Transmit linked parameters",
		"Don't transmit linked parameters",
		"Turn ON all MIDI output",
		"Turn OFF all MIDI output",
		"Turn ON MIDI Terminal",
		"Turn OFF MIDI Terminal",
		'Turn ON "Auto Display"',
		'Turn OFF "Auto Display"',
		'Turn ON "Flash ROM Write Mode" (unlock step 1)',
		'Turn ON "Flash ROM Write Mode" (unlock step 2)',
		'Turn ON "Flash ROM Write Mode" (unlock step 3)',
		'Turn OFF "Flash ROM Write Mode"'
	];

	var handshake_type={
		NOP: 0,
		ARE_YOU_THERE: 1,
		IM_ALIVE: 2,
		BUSY: 3,
		READY: 4,
		ERROR: 5,
		SMALL_ADDRESS_MODE: 6,
		LARGE_ADDRESS_MODE: 7,
		TURN_ON_FLASH_ROM_WRITE_MODE_1:	17,
		TURN_ON_FLASH_ROM_WRITE_MODE_2:	18,
		TURN_ON_FLASH_ROM_WRITE_MODE_3:	19,
		TURN_OFF_FLASH_ROM_WRITE_MODE:	20,
		RUN_FLASH_COMMAND: 21,
		CLEAR_CHECKSUM: 22,
		FLAG_DISPLAY_UPDATE: 23
	};

	this.handshake_send=function(type,callback,timeout){
		self.midi_message({
			type: self.message_type.HANDSHAKE,
			data: self.nibblize(type),
			callback: callback,
			timeout: timeout
		});
	};

	function handshake_parse(buf) {
		var i=5;
		var cmd=buf[i]+(buf[i+1]<<4);
		i+=2;
		if (self.DEBUG>0)
			console.log('handshake: '+handshake_message[cmd]);
		return cmd;
	};

	// build control tree

	var controlTreeStack=[];

	function controlTree_build(systemConfiguration,callback) {
		var levels=[];
		var numLevels=0;
		for (var i=0; i<systemConfiguration.numberOfControlLevels; ++i) 
			levels.push(0);

		self.config.controlTree.count=0;
		controlTreeStack=[];
		self.controlTree_loop(numLevels,levels,callback);
	};

	this.controlTree_loop=function(numLevels,levels,callback) {

		function controlTree_add_callback(od) {
			var branch={};
			if (controlTreeStack.length) {
				branch=controlTreeStack[controlTreeStack.length-1];
			};
			if (od.name) {
				console.log(printf('%04X %04X %04X %04X %04X %04X %04X %04X%s%s    %s    index[%d]',numLevels,levels[0],levels[1],levels[2],levels[3],levels[4],od.maxValue[0],od.objectType," ".repeat((numLevels+1)<<2),(od.isControlLevel?'*':'')+od.name,(od.isControlLevel?'':od.minValue[0]+' <> '+od.maxValue[0]),self.config.controlTree.count));
				++self.config.controlTree.count;
			};

			if (od.isControlLevel) {
				controlTreeStack.push({
					max: od.maxValue[0]
				});
				++numLevels;
			} else {
				while (true) {
					if (levels[numLevels-1]<branch.max) {
						++levels[numLevels-1];
						break;
					}; 
					levels[numLevels-1]=0;
					controlTreeStack.pop();
					if (!controlTreeStack.length) {
						console.log('done');
						if (callback) {
							callback(self.config.controlTree);
						};
						return;
					};
					branch=controlTreeStack[controlTreeStack.length-1];
					--numLevels;
				}
			};
			setTimeout(function(){self.controlTree_loop(numLevels,levels,callback);},0);
		};

		controlTree_add(numLevels,levels,controlTree_add_callback);
	};

	function controlTree_add(numLevels,levels,callback) {

		objectTypeId_request(numLevels,levels,function(objectType){
			if (objectType<0) {
				console.log('error');
				callback({error: 1});
				return;
			};
			objectDescription_request(objectType,function(objectDescription) {
				callback(objectDescription);
			});
		});
	};

	this.patching_destinations_rebuild=function(callback) {
		var destinations=['Unassignd'];
		var effects_count=7;

	        function loop(effect) {
			var effect_name=self.config.objectDescription[self.config.controlTree[0][effect].objectType].name;
			console.log(effect_name);

			var levels=[0,effect];
			self.dataMessage_request(2,levels,function(dataMessage){
				console.log(dataMessage);
				var algo=dataMessage.data[0];

				if (algo) {
					var param_count=self.config.objectDescription[self.config.controlTree[0][effect][algo].objectType].maxValue[0];
					for (var param=0; param<=param_count; ++param) {
						var od=self.config.objectDescription[self.config.controlTree[0][effect][algo][param].objectType];
						if (od.patchable) {
							var param_name=od.name;
							destinations.push(effect_name+' - '+param_name);
						}
					}
				};

				++effect;
				if (effect<effects_count) {
					loop(effect);

				} else {
					destinations=destinations.concat(['KnobValue','LFO1Rate','LFO1PW','LFO1Phase','LFO1Depth','LFO1OnLvl','LFO2Rate','LFO2PW','LFO2Phase','LFO2Depth','LFO2OnLvl','RandRndLo','RandRndHi','RandRate','A/B ARate','A/B BRate','A/B OnLvl','Env ATrim','Env Resp','PostMix','PostLevel','SendLevel','NGatSend','NGatThrsh','NGatAtten','NGatOffse','NGatATime','NGatHTime','NGatRTime','NGatDelay','TempRate','Byp FX1','Byp FX2','Byp Chrs','Byp Delay','Byp Rvb','Byp EQ','Byp Gain','Byp Ins']);
					self.displayUnitLabel[0x67]=destinations;
					if (callback) process.nextTick(callback);
				}
			});
		};
		loop(0);
	};

	// build the control tree
	function config_init(path,callback) {
		self.shortAddresses_set(0);
		// or build the control tree
		systemConfiguration_request(function(sc){
			self.config.systemConfiguration=sc;
			if (self.DEBUG>0) console.log(sc);
			self.CONFIG_FILE=printf('./%02X%02X-%02d%02d.json',self.COMPANY_ID,self.PRODUCT_ID,sc.majorVersion,sc.minorVersion);
			if (!self.config.ready) {
				config_build();
			} else {
				if (self.MAJOR_VERSION==sc.majorVersion&&self.MINOR_VERSION==sc.minorVersion) {
					if (callback) callback();
					return;
				} else {
					file.stat(self.CONFIG_FILE,function(err,stats){
						if (err || !stats.size) {
							config_build();
						} else {
							// read the config file
							config_read(self.CONFIG_FILE,function(err){
								if (err) {
									config_build();
								} else {
									self.config.ready=true;
									if (callback) callback();
									return;
								}
							});
						}
					});
				}
			};

			function config_build() {
				self.MAJOR_VERSION=sc.majorVersion;
				self.MINOR_VERSION=sc.minorVersion;
				self.INFO_FILE=printf('./info%02X%02X-%02d%02d.json',self.COMPANY_ID,self.PRODUCT_ID,self.MAJOR_VERSION,self.MINOR_VERSION);
				file.readFile(self.INFO_FILE,'utf8',function(err,data){
					if (!err) self.info=JSON.parse(data);
				});
				console.log('building the parameter tree');
				objectDescription_build(sc,0,function(){
					console.log('building the control tree');
					self.buildingControlTree=true;
					controlTree_build(sc,function(){
						self.buildingControlTree=false;
						self.controlTree_send();
						config_save(self.CONFIG_FILE,callback);
					});
				});
			}
		});
	};

	this.controlTree_send=function() {
	};

	function config_save(path,callback) {
		fs.writeFile(path,JSON.stringify(self.config),function(err){
			if (err) {
				console.log('cannot save the configuration file: ',err);
			} else {
				console.log('configuration file saved');
			};
			if (callback) callback(err);
		});
	};

	function config_read(path,callback) {
		file.readFile(path,'utf8',function(err,data){
			if (err) {
				console.log('cannot read the configuration file: ',err);
			} else {
				self.config=JSON.parse(data);
				if (self.DEBUG) console.log('configuration loaded');
			};
			if (callback) callback(err);
		});
	};

	function objectDescription_build(systemConfiguration,objectType) {

		objectType=objectType||0;

		objectDescription_request(objectType,function(od){
			if (od.name.length<16) {
				od.name+=' '.repeat(16-od.name.length);
			};
			var c1=printf('%04X    %02X    %s    %04X    %02X    %04X    %02X  ',objectType,od.name.length,od.name,od.dataSize,od.controlFlags,od.optionObjectType,od.numberOfUnitsOrLimits);
			for (var i=0; i<od.numberOfUnitsOrLimits; ++i) {
				c1+=printf('    %04X    %04X    %04X',od.minValue[i],od.maxValue[i],od.displayUnits[i]);
			};
			console.log(c1);
			++objectType;
			if (objectType<systemConfiguration.numberOfObjectTypes)
				objectDescription_build(systemConfiguration,objectType);
		});
	};

	this._optionTypeList_build=function(systemConfiguration,objectType,one) {

		objectType=objectType||0;
		var od=self.config.objectDescription[objectType];
		if (one||(od.optionType!=0xFFFF)) {
			if (od.name.length<16) {
				od.name+=' '.repeat(16-od.name.length);
			};
			var c1=printf('%04X    %02X    %s    %04X    %02X    %04X    %02X  ',objectType,od.name.length,od.name,od.dataSize,od.controlFlags,od.optionType,od.numberOfUnitsOrLimits);
			for (var i=0; i<od.numberOfUnitsOrLimits; ++i) {
				c1+=printf('    %04X    %04X    %04X',od.minValue[i],od.maxValue[i],od.displayUnits[i]);
			}
			console.log(c1);
			if (!one) self._optionTypeList_build(systemConfiguration,od.optionType,1);
		};
		if (one) return;
		++objectType;
		if (objectType<systemConfiguration.numberOfObjectTypes)
			self._optionTypeList_build(systemConfiguration,objectType);
	};

	function objectDescription_build(systemConfiguration,objectType,callback) {

		objectType=objectType||0;

		objectDescription_request(objectType,function(od){
			if (od.name.length<16) {
				od.name+=' '.repeat(16-od.name.length);
			};
			var c1=printf('%04X    %02X    %s    %04X    %02X    %04X    %02X  ',objectType,od.name.length,od.name,od.dataSize,od.controlFlags,od.optionType,od.numberOfUnitsOrLimits);
			for (var i=0; i<od.numberOfUnitsOrLimits; ++i) {
				c1+=printf('    %04X    %04X    %04X',od.minValue[i],od.maxValue[i],od.displayUnits[i]);
			};
			console.log(c1);
			++objectType;
			if (objectType<systemConfiguration.numberOfObjectTypes)
				setTimeout(function(){
					objectDescription_build(systemConfiguration,objectType,callback);
				},0);
			else if (callback) callback();
		});
	};

	this.getProgramAddr=function(programNumber) {


		var levels=[0x01, 0x0A, 0x00, 0x00];

		if (isNaN(programNumber) || programNumber<1 || programNumber>300) {
			levels[2]=2;
			levels[3]=0x64; // active program
		} else if (programNumber<=100) {
			levels[3]=programNumber-1;
		} else if (programNumber<=200) {
			levels[2]=1;
			levels[3]=programNumber-100-1;
		} else if (programNumber<=300) {
			levels[2]=2;
			levels[3]=programNumber-200-1;
		};

		return levels;
	};

	this.parseProgramAddr=function(numLevels,levels) {
		if (self.DEBUG>0) console.log(numLevels,levels);
		if (numLevels==4) {
			if (levels[0]==0x01 && levels[1]==0x0A) {
				switch(levels[2]) {
					case 0:
						return levels[3]+1;
					case 1:
						return 100+levels[3]+1;
					case 2:
						if (levels[3]<0x64) {
							return 200+levels[3]+1;
						}
				}
			}
		}
	};

	// request program dump
	this.programDump=function(programNumber,callback){

		if (typeof(programNumber)=='function') {
			callback=programNumber;
			programNumber=undefined;
		} else {
			programNumber=parseInt(programNumber);
		};

		var levels=self.getProgramAddr(programNumber);

		self.dataMessage_request(levels.length,levels,programDump_callback);

		function programDump_callback(dataMessage) {

			var data=dataMessage.data;
			var diff=self.dump(data,'dump');

			if (self.FIND_OFFSETS_IN_DUMP) {

				// find address in dump
				var level=self.getLevel(self.chg_levels.length,self.chg_levels);
				var od=self.config.objectDescription[level.objectType];
				var dataSize=od.dataSize;
				if (od.optionType!=0xFFFF) {
					dataSize+=self.config.objectDescription[od.optionType].dataSize;
				};

				if (!level.ok) {
					if (diff) {
						level.offset=diff;
						if (diff.length==dataSize) {
							console.log('confirmed: ',level.offset);
							level.ok=true;
						} else {
							console.log(dataMessage.levels);
							console.log(od);
							console.log(diff.length+'!='+od.dataSize);
						};
						config_save(self.CONFIG_FILE,function(){});
					}
				} else {
					console.log('got it yet: ',level.offset);
				}
			};
			if (callback) callback(dataMessage);
		}
	};

	this.getProgramName=function(dump) {
		var name='';
    if (dump[0x11e]!=0) {
		  for (var i=0x11e; i<0x12a; ++i) {
		  	name+=String.fromCharCode(dump[i]);
		  }
    };
		return name.trim(' ');
	};

	this.nibblize16=function(data) {
		var ret=[];
		ret.push(data&0xF);
		ret.push((data>>4)&0xF);
		ret.push((data>>8)&0xF);
		ret.push((data>>12)&0xF);
		return ret;
	};

	this.nibblize=function(data) {
		var ret=[];
		if (typeof(data)=='number') {
			data=[data];
		};
		for (var i=0; i<data.length; ++i) {
			ret.push(data[i]&0xF);
			ret.push((data[i]>>4)&0xF);
		};
		return ret;
	};

	this.midiout_q=[];
	this.midiout_lock;
  this.midiout_timestamp=0;
	this.midi_message=function(msg) {
		self.midiout_q.push(msg);
		if (!self.midiout_lock) {
      self.midioutq_loop();
		}
	};
	
  this.midioutq_loop=function(){
        this.midioutq_sendone();
        return;
      var t=new Date().getTime();
      if (t-self.midiout_timestamp<50) {
        setTimeout(self.midioutq_sendone,50-(t-self.midiout_timestamp));
      } else {
        this.midioutq_sendone();
      }
  };

  this.midioutq_sendone=function() {
    try {
      self.midi_message_send(self.midiout_q.shift());
    } catch(e) {
      console.log(e);
      console.trace();
    }
    self.midiout_timestamp=new Date().getTime();
    if (self.midiout_q.length==0) {
      self.midiout_lock=false;
    } else {
      process.nextTick(self.midioutq_loop);
    }
  };

	this.midi_message_send=function(msg) {

    if (msg.raw) {
      var request=msg.data;
    } else {
       
      var request=[0xF0, self.COMPANY_ID, self.PRODUCT_ID, self.DEVICE_ID];

      request=request.concat(msg.type);

      if (msg.callback) {
        self.sysex_hook_add(msg);
      };

      if (msg.request_type!=undefined) {
        request=request.concat(self.nibblize(msg.request_type));
      };

      if (msg.dataSize) {
        request=request.concat(self.nibblize16(msg.dataSize));
      };

      if (msg.data) {
        request=request.concat(msg.data);
      };

      if (msg.numLevels!=undefined) {
        request=request.concat(self.nibblize16(msg.numLevels));
        if (msg.numLevels) {
          if (self.shortAddresses_mode&&msg.type==self.message_type.DATA) {
            msg.levels.forEach(function(level){
              request=request.concat(self.nibblize(level));
            });
          } else {
            msg.levels.forEach(function(level){
              request=request.concat(self.nibblize16(level));
            });
          } 
        }
      };
      
      request.push(0xF7);

      if (msg.timeout) {
        msg.timeout.ref=setTimeout(function(){
          msg.timeout.callback.call(msg,msg);
        },msg.timeout.duration||2000);
      }
    };

		if (self.DEBUG)
			self.dump(request,'midiout');

		if (request.length>20480) {
      var index=0;
      function loop() {
        var partial=new Array;
        while(index<request.length) {
          partial.push(request[index]);
          ++index;
          if (index%16==0) break;
        }
        console.log(partial.length);
        self.midiout.sendMessage(partial);
        if (index<request.length) {
          setTimeout(loop,550);
        }
      }
      loop();
    } else {
      self.midiout.sendMessage(request);
    }
	};

	this.init=function(options,callback) {
		if (typeof(options)=="function") {
			callback=options;
			options={};
		} else {
			if (options==undefined) {
				options={};
			}
		};

		self.PRODUCT_ID=options.PRODUCT_ID||self.PRODUCT_ID;
		self.DEVICE_ID=options.DEVICE_ID||self.DEVICE_ID;
		self.MIDI_INPUT=options.MIDI_INPUT||self.MIDI_INPUT;
		self.MIDI_OUTPUT=options.MIDI_OUTPUT||self.MIDI_OUTPUT;
		self.MAJOR_VERSION=options.MAJOR_VERSION||self.MAJOR_VERSION;
		self.MINOR_VERSION=options.MINOR_VERSION||self.MINOR_VERSION;
		self.CONFIG_FILE=printf('./%02X%02X-%02d%02d.json',self.COMPANY_ID,self.PRODUCT_ID,self.MAJOR_VERSION,self.MINOR_VERSION);

		file.stat(self.CONFIG_FILE,function(err,stats){
			if (err || !stats.size) {
				init_step2();
			} else {
				// read the config file
				config_read(self.CONFIG_FILE,function(err){
    					self.config.ready=err?false:true;
					init_step2();
				});
				self.INFO_FILE=printf('./info%02X%02X-%02d%02d.json',self.COMPANY_ID,self.PRODUCT_ID,self.MAJOR_VERSION,self.MINOR_VERSION);
				// read info file
				file.readFile(self.INFO_FILE,'utf8',function(err,data){
					if (!err) self.info=JSON.parse(data);
				});
			}
		});

		function init_step2() { 
			self.midi_init(function(){
				_handshake(callback);
			});
		}
	};

	function _handshake(callback) {
		self.midi_message({
			type: self.message_type.HANDSHAKE,
			data: self.nibblize(handshake_type.ARE_YOU_THERE),
			callback: function(buf){
				if (handshake_parse(buf)==handshake_type.IM_ALIVE) {
          if (!self.DEBUG) {
            if (_handshake.timeout) clearTimeout(_handshake.timeout);
            _handshake.timeout=setTimeout(function(){_handshake(callback)},10000);
          }
					if (!self.alive) {
						self.alive=true;
						config_init(self.CONFIG_FILE,callback)
					};
          if (!self.DEBUG) {
            if (_handshake.timeout) clearTimeout(_handshake.timeout);
            _handshake.timeout=setTimeout(function(){_handshake(callback)},10000);
          }
					return false;
				};
				if (_handshake.timeout) clearTimeout(_handshake.timeout);
				_handshake.timeout=setTimeout(function(){_handshake(callback)},10000);
			},
			timeout: {
				callback: function(){
					if (self.DEBUG) console.log('timeout: handshake');
					self.alive=false;
					if (_handshake.timeout) clearTimeout(_handshake.timeout);
					self.midi_message(this);
				}
			}
		});
	};

	this.shortAddresses_set=function(enable) {
		if (enable) {
//			self.shortAddresses_mode=0;
			self.dataMessage(3,[1,0x12,5],1);
//			self.shortAddresses_mode=1;
		} else {
//			self.shortAddresses_mode=1;
			self.dataMessage(3,[1,0x12,5],0);
//			self.shortAddresses_mode=0;
		}
	};

	this.midiAutomation_set=function(enable){
		self.dataMessage(3,[1,2,5],enable?1:0);
	};

	this.set=function(path,data) {
		self.getLevelsByName(path,function(levels){
			if (levels) {
				self.dataMessage(levels.length,levels,data);
			}
		});
	};

	this.get=function(path,callback) {
		self.getLevelsByName(path,function(levels) {
			if (levels) {
				self.dataMessage_request(levels.length,levels,callback);
			}
		});
	};

	this.dataType=function(path) {
		self.getLevelsByName(path,function(levels){
			if (levels) {
				var od=self.config.objectDescription[self.getLevel(levels.length,levels).objectType];
				console.log(od);
				if (od.optionType!=0xFFFF)
					console.log(self.config.objectDescription[od.optionType]);

			}
		});
	};

	this.getLevelsByName=function(path,callback) {
		var path=path.split('.');
		var levels=[];
		var match;
		for(var level=0; level<path.length; ++level) {
			match=self.search(path[level],levels);
			if (!match) {
				console.log(path[level],': key not found');
				callback();
			};
			levels.push(parseInt(match));
		};
		if (callback) {
			callback(levels);
		} else {
		       	return levels;
		}
	};

	this.search=function(term,levels) {
		var curLevel;
		term=term.toLowerCase().replace(/ /g,'');

		if (self.DEBUG>0) console.log(term,levels);
		if (levels.length) {
			curLevel=self.getLevel(levels.length,levels);
		} else {
			curLevel=self.config.controlTree;
		};

		if (curLevel) {
			for(var elem in curLevel) {
				if (typeof(curLevel[elem])=='object') {
					var name=self.config.objectDescription[curLevel[elem].objectType].name;
					if (name.toLowerCase().replace(/ /g,'')==term) {
						return elem;
					}

				}
			}
		};
		return levels;
	};

        this.toL=function(numLevels,levels) {
		var L='';
		for (var i=0; i<numLevels; ++i) {
			var hex=levels[i].toString(16).toUpperCase();
			if (hex.length==1) {
				L+='0'+hex;
			} else {
				L+=hex;
			}       
		};
		return L;
	};

    	this.x=function(s) {
		var request=[];
	       	s.split(' ').forEach(function(v,i){
			request.push(parseInt(v,16))
		});
	       	return request;
	};

	this.displayUnitLabel={
		0: '%',
		2: ['Sine','Triangle','Square'],
		3: '%',
		4: ['Off','On'],
		8: 'Cycles:Beat',
		9: 'Hz',
		0xa: 'Q',
		0x10: ['Auto','Manual'],
		0x11: ['Off','On','Latch','Gate','Once','Reset','RTrig'],
		0x13: ['Hz','Cycles:Beat'],
		0x14: ['ms','Echoes:Beat','Feet','Meters','Tap ms','Samples'],
		0x15: ['Effect 1','Effect 2','Chorus','Delay','Reverb','EQ','Input'],
		0x17: 'Hz',
		0x19: ['','Fast','Medium Fast','Slow','Medium Slow'],
		0x1b: ['by Name','by Number','Search for Guitar Style','Search for Effect type','Search for App & Effect','Show members of MIDI Maps','Show members of Program Chains','show Last 10 Loaded'],
		0x1f: ['Off','Help'],
		0x20: ['Program','Global'],
		0x21: ['All Mute','Bypass'],
		0x23: ['Stereo','Mono'],
		0x26: 'BPM',
		0x27: ['Internal','MIDI'],
		0x28: ['None','Off','On','Knob','Puls1','Tri1','Sine1','Cos1','Puls2','Tri2','Sine2','Cos2','Rand','Env','InLvl','RnLvl','A/B','ATrg','BTrg','ABTrg','Pedal','Tog1','Tog2','Tog3','Sw1','Sw2','Sw3','CC1','CC2','CC3','CC4','CC5','CC6','CC7','CC8','CC9','CC10','CC11','CC12','CC13','CC14','CC15','CC16','CC17','CC18','CC19','CC20','CC21','CC22','CC23','CC24','CC25','CC26','CC27','CC28','CC29','CC30','CC31','CC33','CC34','CC35','CC36','CC37','CC38','CC39','CC40','CC41','CC42','CC43','CC44','CC45','CC46','CC47','CC48','CC49','CC50','CC51','CC52','CC53','CC54','CC55','CC56','CC57','CC58','CC59','CC60','CC61','CC62','CC63','CC64','CC65','CC66','CC67','CC68','CC69','CC70','CC71','CC72','CC73','CC74','CC75','CC76','CC77','CC78','CC79','CC80','CC81','CC82','CC83','CC84','CC85','CC86','CC87','CC88','CC89','CC90','CC91','CC92','CC93','CC94','CC95','CC96','CC97','CC98','CC99','CC100','CC101','CC102','CC103','CC104','CC105','CC106','CC107','CC108','CC109','CC110','CC111','CC112','CC113','CC114','CC115','CC116','CC117','CC118','CC119','Bend','Touch','Vel','Last Note','Low Note','High Note','Tempo','Cmnds','Gate','Trig','LGate','TSw','Toe'],
		0x29: ['None','Off','On','Knob','Puls1','Tri1','Sine1','Cos1','Puls2','Tri2','Sine2','Cos2','Rand','Env','InLvl','RnLvl','A/B','ATrg','BTrg','ABTrg','Pedal','Tog1','Tog2','Tog3','Sw1','Sw2','Sw3','CC1','CC2','CC3','CC4','CC5','CC6','CC7','CC8','CC9','CC10','CC11','CC12','CC13','CC14','CC15','CC16','CC17','CC18','CC19','CC20','CC21','CC22','CC23','CC24','CC25','CC26','CC27','CC28','CC29','CC30','CC31','CC33','CC34','CC35','CC36','CC37','CC38','CC39','CC40','CC41','CC42','CC43','CC44','CC45','CC46','CC47','CC48','CC49','CC50','CC51','CC52','CC53','CC54','CC55','CC56','CC57','CC58','CC59','CC60','CC61','CC62','CC63','CC64','CC65','CC66','CC67','CC68','CC69','CC70','CC71','CC72','CC73','CC74','CC75','CC76','CC77','CC78','CC79','CC80','CC81','CC82','CC83','CC84','CC85','CC86','CC87','CC88','CC89','CC90','CC91','CC92','CC93','CC94','CC95','CC96','CC97','CC98','CC99','CC100','CC101','CC102','CC103','CC104','CC105','CC106','CC107','CC108','CC109','CC110','CC111','CC112','CC113','CC114','CC115','CC116','CC117','CC118','CC119','Bend','Touch','Vel','Last Note','Low Note','High Note','Tempo','Cmnds','Gate','Trig','LGate','TSw','Toe'],
		0x2a: ['Eighth','DottedHeighth','Quarter','DottedQuarter','2 Beats','3 Beats','4 Beats','5 Beats','6 Beats','7 Beats','8 Beats','9 Beats','10 Beats','11 Beats','12 Beats','13 Beats','14 Beats','16 Beats','17 Beats','18 Beats','19 Beats','20 Beats','21 Beats','22 Beats','23 Beats','24 Beats','25 Beats','26 Beats','27 Beats','28 Beats','29 Beats','30 Beats','31 Beats','32 Beats','33 Beats','34 Beats','35 Beats','36 Beats','37 Beats','38 Beats','39 Beats','40 Beats','41 Beats','42 Beats','43 Beats','44 Beats','45 Beats','46 Beats','47 Beats','48 Beats','49 Beats','50 Beats','51 Beats','52 Beats','53 Beats','54 Beats','55 Beats','56 Beats','57 Beats','58 Beats','59 Beats','60 Beats','61 Beats','62 Beats','63 Beats','64 Beats','65 Beats','66 Beats','67 Beats','68 Beats','69 Beats','70 Beats','71 Beats','72 Beats','73 Beats','74 Beats','75 Beats','76 Beats','77 Beats','78 Beats','79 Beats','80 Beats','81 Beats','82 Beats','83 Beats','84 Beats','85 Beats','86 Beats','87 Beats','88 Beats','89 Beats','90 Beats','91 Beats','92 Beats','93 Beats','94 Beats','95 Beats','96 Beats','97 Beats','98 Beats','99 Beats','100 Beats','101 Beats','102 Beats','103 Beats','104 Beats','105 Beats','106 Beats','107 Beats','108 Beats','109 Beats','110 Beats','111 Beats','112 Beats','113 Beats','114 Beats','115 Beats','116 Beats','117 Beats','118 Beats','119 Beats','120 Beats','121 Beats','122 Beats','123 Beats','124 Beats','125 Beats','126 Beats'],
		0x2b: 'ms',
		0x2d: ['None','Post Mix','FX 1 Mix','FX 2 Mix','Chrs Mix','Dly Mix','Rvb Mix','Eq Mix','Post Lvl','FX 1 Lvl','FX 2 Lvl','Chrs Lvl','Dly Lvl','Rvb Lvl','Eq Lvl','Clr Loop','Layer','Replace','Delay','StopStrt'],
		0x2e: ['Current Pgm','All Programs','Map 1','Map 2','Map 3','Chain 1','Chain 2','Chain 3','Chain 4','Chain 5','Chain 6','Chain 7','Chain 8','Chain 9','Chain 10','Setup 1','Setup 2','Setup 3','Setup 4','Setup 5'],
		0x2f: ['LShlf','Band','HShlf'],
		0x31: ['Model C','Model V'],
		0x34: ['Off','In','Ret L','Ret R','Raw L','Raw R','Fx1 L','Fx1 R','Fx2 L','Fx2 R','Chrs L','Chrs R','EQ L','EQ R','Rvb L','Rvb R','Dly L','Dly R','PreOut','MainL','MainR'],
		0x35: ['4.0M','4.5M','5.0M','5.5M','6.0M','6.5M','7.0M','7.5M','8.0M','8.5M','9.0M','9.5M','10.0M','10.5M','11.0M','11.5M','12.0M','12.5M','13.0M','13.5M','14.0M','14.5M','15.0M','15.5M','16.0M','16.5M','17.0M','17.5M','18.0M','18.5M','19.0M','19.5M','20.0M','20.5M','21.0M','21.5M','22.0M','22.5M','23.0M','23.5M','24.0M','24.5M','25.0M','25.5M','26.0M','26.5M','27.0M','27.5M','28.0M','28.5M','29.0M','29.5M','30.0M','30.5M','31.0M','31.5M','32.0M','32.5M','33.0M','33.5M','34.0M','34.5M','35.0M','35.5M','36.0M','36.5M','37.0M','37.5M','38.0M','38.5M','39.0M','39.5M','40.0M','40.5M','41.0M','41.5M','42.0M','42.5M','43.0M','43.5M','44.0M','44.5M','45.0M','45.5M','46.0M','46.5M','47.0M','47.5M','48.0M','48.5M','49.0M','49.5M','50.0M','50.5M','51.0M','51.5M','52.0M','52.5M','53.0M','53.5M','54.0M','54.5M','55.0M','55.5M','56.0M','56.5M','57.0M','57.5M','58.0M','58.5M','59.0M','59.5M','60.0M','60.5M','61.0M','61.5M','62.0M','62.5M','63.0M','63.5M','64.0M','64.5M','65.0M','65.5M','66.0M','66.5M','67.0M','67.5M','68.0M','68.5M','69.0M','69.5M','70.0M','70.5M','71.0M','71.5M','72.0M','72.5M','73.0M','73.5M','74.0M','74.5M','75.0M','75.5M','76.0M'],
		0x36: ['525', '589', '654', '818', '986', '1.1K', '1.3K', '1.5K', '1.6K', '1.8K', '2.0K', '2.2K', '2.4K', '2.6K', '2.9K', '3.1K', '3.3K', '3.5K', '3.8K', '4.0K', '4.3K', '4.6K', '4.8K', '5.1K', '5.4K', '5.7K', '6.1K', '6.4K', '6.8K', '7.1K', '7.5K', '7.9K', '8.4K', '8.8K', '9.3K', '9.9K', '10.4K', '11.0K', '11.7K', '12.4K', '13.2K', '14.1K', '15.2K', '16.3K', '17.7K', '19.4K', '21.6K', '24.7K', 'Flat'],
		0x37: ['0.2X','0.4X','0.6X','0.8X','1.0X','1.2X','1.5X','2.0X','3.0X','4.0X'],
		0x38: ['30','60','90','120','151','181','212','243','273','336','398','461','525','589','654','818','986','1.1K','1.3K','1.5K','1.6K','1.8K','2.0K','2.2K','2.4K','2.6K','2.9K','3.1K','3.3K','3.5K','3.8K','4.0K','4.3K','4.6K','4.8K','5.1K','5.4K','5.7K','6.1K','6.4K','6.8K','7.1K','7.5K','7.9K','8.4K','8.8K','9.3K','9.9K','10.4K','11.0K','11.7K','12.4K','13.2K','14.1K','15.2K','16.3K','17.7K','19.4K','21.6K','24.7K','Full'],
		0x39: ['0.12s','0.13s','0.14s','0.15s','0.16s','0.17s','0.18s','0.19s','0.20s','0.21s','0.22s','0.22s','0.23s','0.24s','0.25s','0.26s','0.27s','0.28s','0.29s','0.30s','0.31s','0.32s','0.34s','0.35s','0.36s','0.38s','0.39s','0.40s','0.42s','0.44s','0.45s','0.47s','0.49s','0.51s','0.54s','0.56s','0.58s','0.61s','0.64s','0.67s','0.70s','0.74s','0.78s','0.82s','0.87s','0.92s','0.98s','1.05s','1.12s','1.20s','1.30s','1.41s','1.53s','1.68s','1.86s','2.08s','2.36s','2.71s','3.18s','3.84s','4.83s','6.48s','9.78s','19.6s'],
		0x3a: '%X2',
		0x3e: ['-16','-15','-14','-13','-12','-11','-10','-9','-8','-7','-6','-5','-4','-3','-2','-1','0','+1','+2','+3','+4','+5','+6','+7','+8','+9','+10','+11','+12','+13','+14','+15','+16'],
		0x3b: 'ms',
		0x3f: ['Off','-48dB','-42dB','-39dB','-36dB','-33dB','-30dB','-27dB','-24dB','-22dB','-20dB','-18dB','-16dB','-14dB','-12dB','-10dB','-9dB','-8dB','-7dB','-6dB','-5dB','-4dB','-3dB','-2dB','-1dB','Full'],
		0x40: ['140ms','145ms','150ms','155ms','160ms','165ms','170ms','175ms','180ms','185ms','190ms','195ms','200ms','205ms','210ms','215ms','220ms','225ms','230ms','235ms','240ms','245ms','250ms','255ms','260ms','265ms','270ms','275ms','280ms','285ms','290ms','295ms','300ms','305ms','310ms','315ms','320ms','325ms','330ms','335ms','340ms','345ms','350ms','355ms','360ms','365ms','370ms','375ms','380ms','385ms','390ms','395ms','400ms','405ms','410ms','415ms','420ms','425ms','430ms','435ms','440ms','445ms','450ms','455ms','460ms','465ms','470ms','475ms','480ms','485ms','490ms','495ms','500ms','505ms','510ms','515ms','520ms','525ms','530ms','535ms','540ms','545ms','550ms','555ms','560ms','565ms','570ms','575ms','580ms','585ms','590ms','595ms','600ms','605ms','610ms','615ms','620ms','625ms','630ms','635ms','640ms','645ms','650ms','655ms','660ms','665ms','670ms','675ms','680ms','685ms','690ms','695ms','700ms'],
		0x42: ['0.5K','1.0K','1.6K','2.2K','2.9K','3.6K','4.4K','5.5K','6.3K','7.5K','8.9K','10.6K','12.8K','15.9K','21.2K'],
		0x45: 'Feet',
		0x46: 'Meters',
		0x47: ['0&deg;','90&deg;','180&deg;','270&deg;'],
		0x41: ['C0','C#0','D0','D#0','E0','F0','F#0','G0','G#0','A0','A#0','B0','C1','C#1','D1','D#1','E1','F1','F#1','G1','G#1','A1','A#1','B1','C2','C#2','D2','D#2','E2','F2','F#2','G2','G#2','A2','A#2','B2','C3','C#3','D3','D#3','E3','F3','F#3','G3','G#3','A3','A#3','B3','C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5','C#5','D5','D#5','E5','F5','F#5','G5','G#5','A5','A#5','B5','C6','C#6','D6','D#6','E6','F6','F#6','G6','G#6','A6','A#6','B6','C7','C#7','D7','D#7','E7','F7','F#7','G7','G#7','A7','A#7','B7','C8','C#8','D8','D#8','E8','F8','F#8','G8','G#8','A8','A#8','B8','C9','C#9','D9','D#9','E9','F9','F#9','G9','G#9','A9','A#9','B9','C10','C#10','D10','D#10','E10','F10','F#10','G10'],
		0x48: 'ms',
		0x49: 'ms',
		0x4D: ['Bypass','On'],
		0x4E: ['Bypass','On'],
		0x4F: ['Bypass','On'],
		0x50: ['Bypass','On'],
		0x51: ['Out','In'],
		0x52: ['Gain','Clean'],
		0x53: ['Off','On'],
		0x54: ['Norml','Loop'],
		0x55: ['Bypass','On'],
		0x59: ['Disabled','Bypass','All Mute','Input Mute'],
		0x5a: ['Disabled','Bypass','All Mute','Insert Mute'],
		0x5b: ['FX Loop','Mix','Parallel'],
		0x5c: ['Mute','Post Mute','All Bypass'],
		0x5d: ['Off','Guitar Input','Returns Only'],
		0x5e: ['Combo1Brite','Combo1Norml','Combo1Warm','Combo1Dark','Combo2Brite','Combo2Norml','Combo2Warm','Combo2Dark','Stack1Brite','Stack1Norml','Stack1Warm','Stack1Dark','Stack2Brite','Stack2Norml','Stack2Warm','Stack2Dark'],
		0x5f: ['Disabled','Off = Bypass','On = Bypass'],
		0x60: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
		0x61: ['Major','Doryan','Phrygian','Lydian','Mixolydian','Minor','Loc'],
		0x62: ['@Oct','@7th','@6th','@5th','@4th','@3rd','@2nd','-oct','-7th','-6th','-5th','-4th','-3rd','-2nd','uni','+2nd','+3rd','+4th','+5th','+6th','+7th','+oct','*2nd','*3rd','*4th','*5th'],
		0x64: ['Stereo','Left','Right','PreOut'],
		0x65: ['3.0K','4.2K','5.8K','8.0K'], 
		0x66: ['261.63Hz C','277.18Hz C#','293.66Hz D','311.12Hz Eb','329.63Hz E','349.23Hz F','369.99Hz F#','392.00Hz G','415.30Hz Ab','440.00Hz A','466.16Hz Bb','493.88Hz B'],
		0x67: ['Unassignd','FX 1Mix','FX 1Level','FX 1Rate','FX 2Mix','FX 2Level','FX 2Bass','FX 2Resp','FX 2Gain','ChrsMix','ChrsLevel','DlyMix','DlyLevel','DlyTime1','DlyTime2','DlyLvl 1','DlyLvl 2','DlyFbk 1','DlyFbk 2','DlyDamp1','DlyDamp2','DlyClear','RvbMix','RvbLevel','RvbSize','RvbLink','RvbDiff','RvbP Dly','RvbDTime','RvbD Lvl','RvbRt HC','GainLo','GainMid','GainHi','GainDrive','GainTone','GainLevel','KnobValue','LFO1Rate','LFO1PW','LFO1Phase','LFO1Depth','LFO1OnLvl','LFO2Rate','LFO2PW','LFO2Phase','LFO2Depth','LFO2OnLvl','RandRndLo','RandRndHi','RandRate','A/B ARate','A/B BRate','A/B OnLvl','Env ATrim','Env Resp','PostMix','PostLevel','SendLevel','NGatSend','NGatThrsh','NGatAtten','NGatOffse','NGatATime','NGatHTime','NGatRTime','NGatDelay','TempRate','Byp FX1','Byp FX2','Byp Chrs','Byp Delay','Byp Rvb','Byp EQ','Byp Gain','Byp Ins'],
		0x68: ['Unassignd','Ctls Off','Ctls On','Ctls Knob','Ctls Puls1','Ctls Tri1','Ctls Sine1','Ctls Cos1','Ctls Puls2','Ctls Tri2','Ctls Sine2','Ctls Cos2','Ctls Rand','Ctls Env','Ctls InLvl','Ctls RnLvl','Ctls A/B','Ctls ATrg','Ctls BTrg','Ctls ABTrg','Ctls Pedal','Ctls Tog1','Ctls Tog2','Ctls Tog3','Ctls Sw1','Ctls Sw2','Ctls Sw3','MIDI CC1','MIDI CC2','MIDI CC3','MIDI CC4','MIDI CC5','MIDI CC6','MIDI CC7','MIDI CC8','MIDI CC9','MIDI CC10','MIDI CC11','MIDI CC12','MIDI CC13','MIDI CC14','MIDI CC15','MIDI CC16','MIDI CC17','MIDI CC18','MIDI CC19','MIDI CC20','MIDI CC21','MIDI CC22','MIDI CC23','MIDI CC24','MIDI CC25','MIDI CC26','MIDI CC27','MIDI CC28','MIDI CC29','MIDI CC30','MIDI CC31','MIDI CC33','MIDI CC34','MIDI CC35','MIDI CC36','MIDI CC37','MIDI CC38','MIDI CC39','MIDI CC40','MIDI CC41','MIDI CC42','MIDI CC43','MIDI CC44','MIDI CC45','MIDI CC46','MIDI CC47','MIDI CC48','MIDI CC49','MIDI CC50','MIDI CC51','MIDI CC52','MIDI CC53','MIDI CC54','MIDI CC55','MIDI CC56','MIDI CC57','MIDI CC58','MIDI CC59','MIDI CC60','MIDI CC61','MIDI CC62','MIDI CC63','MIDI CC64','MIDI CC65','MIDI CC66','MIDI CC67','MIDI CC68','MIDI CC69','MIDI CC70','MIDI CC71','MIDI CC72','MIDI CC73','MIDI CC74','MIDI CC75','MIDI CC76','MIDI CC77','MIDI CC78','MIDI CC79','MIDI CC80','MIDI CC81','MIDI CC82','MIDI CC83','MIDI CC84','MIDI CC85','MIDI CC86','MIDI CC87','MIDI CC88','MIDI CC89','MIDI CC90','MIDI CC91','MIDI CC92','MIDI CC93','MIDI CC94','MIDI CC95','MIDI CC96','MIDI CC97','MIDI CC98','MIDI CC99','MIDI CC100','MIDI CC101','MIDI CC102','MIDI CC103','MIDI CC104','MIDI CC105','MIDI CC106','MIDI CC107','MIDI CC108','MIDI CC109','MIDI CC110','MIDI CC111','MIDI CC112','MIDI CC113','MIDI CC114','MIDI CC115','MIDI CC116','MIDI CC117','MIDI CC118','MIDI CC119','MIDI Bend','MIDI Touch','MIDI Vel','Midi Last Note','MIDI Low Note','MIDI High Note','MIDI Tempo','MIDI Cmnds','MIDI Gate','MIDI Trig','MIDI LGate','MIDI TSw','MIDI Toe'],
		0x69: ['Unassignd','FX 1Mix','FX 1Level','FX 1Rate','FX 2Mix','FX 2Level','FX 2Bass','FX 2Resp','FX 2Gain','ChrsMix','ChrsLevel','DlyMix','DlyLevel','DlyTime1','DlyTime2','DlyLvl 1','DlyLvl 2','DlyFbk 1','DlyFbk 2','DlyDamp1','DlyDamp2','DlyClear','RvbMix','RvbLevel','RvbSize','RvbLink','RvbDiff','RvbP Dly','RvbDTime','RvbD Lvl','RvbRt HC','GainLo','GainMid','GainHi','GainDrive','GainTone','GainLevel','KnobValue','KnobLow','KnobHigh','LFO1Mode','LFO1Rate','LFO1PW','LFO1Phase','LFO1Depth','LFO1OnLvl','LFO1OnSrc','LFO2Mode','LFO2Rate','LFO2PW','LFO2Phase','LFO2Depth','LFO2OnLvl','LFO2OnSrc','RandRndLo','RandRndHi','RandRate','A/B Mode','A/B ARate','A/B BRate','A/B OnLvl','A/B OnSrc','Env Src1','Env Src2','Env ATrim','Env Resp','PostMix','PostLevel','SendLevel','SpkrEnabl','SpkrCabin','NGatEnabl','NGatSend','NGatThrsh','NGatAtten','NGatOffse','NGatATime','NGatHTime','NGatRTime','NGatDelay','TempRate'],
		0x6a: ['Guitar Input','Returns Only'],
		0x6c: 'Samples',
		0x6d: ['Program','Global'],
		0x8000: 'dB',
		0x8002: '%',
		0x8004: 'L/R',
		0x8009: 'dB',
		0x800a: 'dB',
		0x800b: 'cents',
		0x800c: '-dB',
		0x800d: ['Effect Mix','Dry Level'],
		0x800f: 'dB',

	};

  /*
	function concat(bufs) {
		var buffer, length = 0, index = 0;
		
		if (!Array.isArray(bufs)) {
			bufs = Array.prototype.slice.call(arguments);
		};
		for (var i=0, l=bufs.length; i<l; i++) {
			buffer = bufs[i];
			if (!Buffer.isBuffer(buffer)) {
				buffer = bufs[i] = new Buffer(buffer);
			};
			length += buffer.length;
		};
		buffer = new Buffer(length);
		
		bufs.forEach(function (buf, i) {
			buf = bufs[i];
			buf.copy(buffer, index, 0, buf.length);
			index += buf.length;
			delete bufs[i];
		});
		
		return buffer;
	};
*/
	this.getObjectValue=function(od,value) {
		var val=0;
		var unit=0;
		var unitLabel=null;
		var twoValues=false;

		var optionValue=0;
		var optionUnit=0;
		var optionUnitLabel;
		var optionLabel=null;

		while(value.length<od.dataSize) {
			console.log('dataSize workaround',od,value);
			value=buffer.concat(value,[0]);
		};

		if(self.DEBUG>0) {
			console.log('getObjectValue',od,value);
		};
		if(od.optionType!=0xffff) {
			var ood=self.config.objectDescription[od.optionType];
			switch(od.optionType) {
				case 0x12c: // optimize
					if (od.dataSize==2) {
						val=value[0]+(value[1]<<8);
						optionValue=value[2];
					} else {
						val=value[0];
						optionValue=value[1];
					};
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]]; 
					optionUnitLabel=self.displayUnitLabel[ood.displayUnits[0]];
					break;

				case 0x12d: // optimize (ms)
				case 0x12e: // optimize (ms)
					val=value[0];
					optionValue=value[1];
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]]; 
					optionUnitLabel=self.displayUnitLabel[ood.displayUnits[0]];
					break;

				case 0x13a: // ms/echoes:beat/feet/meters/tapms/samples
					unit=optionValue=value[value.length-1];
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]]; 
					optionUnitLabel=self.displayUnitLabel[ood.displayUnits[0]];
					if(optionValue==1) {
						twoValues=true;
					} else {
						val=value[0]+(value[1]<<8);
					};
					break;

				case 0x12f: // rate hz/cycles:beat
				case 0x130:
				case 0x131:
					if (self.DEBUG>0) console.log('od,value',od,value);
					optionValue=value[value.length-1];
					unit=optionValue;
					if (optionValue) {
						twoValues=true;
					} else {
						val=value[0]+(value[1]<<8);
					};
					if (self.DEBUG>0) console.log('ood',ood);
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]]; 
					optionLabel=self.displayUnitLabel[ood.displayUnits[0]];
					break;

				case 0x133: // Fbk Insert (0x15)
				case 0x134: // Eq Type (0x31)
					optionValue=value[1];
					val=value[0];
					optionLabel=self.displayUnitLabel[ood.displayUnits[0]];
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]]; 
					break;

				case 0x132: // Time units (0x14)
				case 0x136: // Time units (0x14)
					optionValue=value[value.length-1];
					unit=optionValue;
					if (optionValue==1) {
						twoValues=true;
					} else {
						val=value[0]+(value[1]<<8);
					};
					optionLabel=self.displayUnitLabel[ood.displayUnits[0]];
					//console.log('ood unit:',ood.displayUnits[0],optionLabel);
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]]; 
					//console.log('od.displayUnits:',od.displayUnits);
					break;

				case 0x139: // Src (guitar input/returns only)
					optionValue=value[1]-1;
					val=value[0];
					optionLabel=self.displayUnitLabel[ood.displayUnits[0]]
					break;

				case 0x13b: // mix control (wet % /dry db)
					val=value[0];
					if (val>100) {
						optionValue=1;
						unit=1;
					} else {
						optionValue=0;
						unit=0;
					};
					optionLabel=self.displayUnitLabel[ood.displayUnits[0]];
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]];
					break;

				default:
					console.log('getObjectValue: unhandled optionType:',od.optionType.toString(16));
					process.exit(0);
					break;
			}
		} else {
			switch(od.displayUnits[0]) {
				case 0x30:
					val=(value[0]==0)?'':value.toString();
					break;
				default:
					if (value) {
						val=value[0]+(value[1]<<8);
					};
					unitLabel=self.displayUnitLabel[od.displayUnits[unit]];
			}
		};

		if (od.displayUnits[unit]&0x8000) {
			if (od.dataSize==1 && val&0x80) {
				val=-(256-val);
			} else if (od.dataSize==2 && val&0x8000) {
				val=-(65536-val);
			}
		};

		return {
			val: val,
			unit: unit,
			optionValue: optionValue,
			optionLabel: optionLabel,
			optionUnitLabel: optionUnitLabel,
			optionUnit: optionUnit,
			unitLabel: unitLabel,
			twoValues: twoValues,
		}
	};

  var getting_usedSteps;
  var getting_usedSteps_callbacks=[];
  this.getUsedSteps=function(callback) {
    var effects_name=['Effect1','Effect2','Chorus','Delay','Equalizer'];
    var effects_algo=['FX1Alg','FX2Alg','ChorusAlg','DelayAlg','EQAlg'];
    var steps={};
    var index=0;
    var levels;
    if (getting_usedSteps) {
      getting_usedSteps_callbacks.push(callback);
      index=0;
      return;
    }
    getting_usedSteps=true;

    function _callback(dm){
      var algo=dm.data[0];
      if (self.DEBUG) console.log('algo:',algo,effects_name[index]);
      if (algo) { 
        levels=self.getLevelsByName('Program.'+effects_name[index]);
        levels.push(algo);
        var path=self.getLevelName(levels.length,levels);
        var info=self.info[path.toLowerCase()];
        if (!info) {
          console.log(path);
          console.trace();
          process.exit(0);
        }
        if (self.DEBUG) console.log('steps:',effects_name[index],info.steps);
        steps[effects_name[index]]=info.steps?parseInt(info.steps,10):0;
      } else {
        steps[effects_name[index]]=0;
      }

      ++index;
      if (index==effects_name.length) {
        callback(steps);
        getting_usedSteps_callbacks.forEach(function(allback,i){
          console.log('callback');
          allback(steps);
        });
        delete getting_usedSteps_callbacks;
        getting_usedSteps_callbacks=[];
        getting_usedSteps=false;

      } else {
        loop();
      }
    }

    function loop() {
      levels=self.getLevelsByName('Program.AlgSelect.'+effects_algo[index]);
      self.dataMessage_request(levels.length,levels,_callback);
    }

    loop();
  }

	if (options||callback) {
		this.init(options,callback);
	};
};

module.exports = {
	mpxg2: mpxg2
};


