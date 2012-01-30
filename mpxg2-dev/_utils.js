var child_process=require('child_process');
var os=require('os');

function url_open(url,callback) {
  switch(os.platform()) {
    case 'win32':
      cmd='start';
      break;
    case 'mac':
    case 'darwin':
      cmd='open';
      break;
    default:
      cmd='xdg-open';
      break;
  }
  console.log('Running '+cmd+' '+url);
  try {
    child_process.exec(cmd+' '+url,callback);

  } catch(e) {
    console.log(e);
    console.log('Error: Cannot open '+url+' in default browser.');
  }
};

module.exports={
  url_open: url_open
};
