var mime = module.exports = {
  types: {},
  extensions :{},
  define: function(map) {
    for (var type in map) {
      var exts = map[type];
      for (var i = 0; i < exts.length; i++) {
        mime.types[exts[i]] = type;
      }
    }
  },
  lookup: function(path) {
    var ext = path.replace(/.*[\.\/]/, '').toLowerCase();
    return mime.types[ext] || 'application/octet-stream';
  }
}
