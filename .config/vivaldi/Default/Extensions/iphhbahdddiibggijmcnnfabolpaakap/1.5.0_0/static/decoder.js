const decoder = {
  r: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/=',
  vkId: 0,
  getRealLink: function(t) {
    if (~t.indexOf('audio_api_unavailable')) {
      var e = t.split('?extra=')[1].split('#'),
        i = '' === e[1] ? '' : this.a(e[1]);
      if (((e = this.a(e[0])), 'string' != typeof i || !e)) {
        return t;
      }

      for (var r, o, s = (i = i ? i.split(String.fromCharCode(9)) : []).length; s--; ) {
        if (((r = (o = i[s].split(String.fromCharCode(11))).splice(0, 1, e)[0]), !this.decodeUrl[r])) {
          return t;
        }
        e = this.decodeUrl[r].apply(null, o);
      }

      if (e && 'http' === e.substr(0, 4)) return e;
    }
    return t;
  },

  a: function(t) {
    if (!t || t.length % 4 == 1) return !1;
    for (var e, i, o = 0, a = 0, s = ''; (i = t.charAt(a++)); )
      (i = this.r.indexOf(i)), ~i && ((e = o % 4 ? 64 * e + i : i), o++ % 4) && (s += String.fromCharCode(255 & (e >> ((-2 * o) & 6))));
    return s;
  },

  s: function(t, e) {
    var i = t.length,
      o = [];
    if (i) {
      var a = i;
      for (e = Math.abs(e); a--; ) o[a] = (e += (e * (a + i)) / e) % i | 0;
    }
    return o;
  },

  decodeUrl: {
    v: function(t) {
      return t
        .split('')
        .reverse()
        .join('');
    },
    r: function(t, e) {
      t = t.split('');
      for (var i, o = r + r, a = t.length; a--; ) (i = o.indexOf(t[a])), ~i && (t[a] = o.substr(i - e, 1));
      return t.join('');
    },
    s: function(t, e) {
      var i = t.length;
      if (i) {
        var r = (function(t, e) {
            var i = t.length,
              r = [];
            if (i) {
              var n = i;
              for (e = Math.abs(e); n--; ) (e = ((i * (n + 1)) ^ (e + n)) % i), (r[n] = e);
            }
            return r;
          })(t, e),
          n = 0;
        for (t = t.split(''); ++n < i; ) t[n] = t.splice(r[i - 1 - n], 1, t[n])[0];
        t = t.join('');
      }
      return t;
    },
    x: function(t, e) {
      var i = [];
      return (
        (e = e.charCodeAt(0)),
        each(t.split(''), function(t, o) {
          i.push(String.fromCharCode(o.charCodeAt(0) ^ e));
        }),
        i.join('')
      );
    },
    i: function(t, e) {
      return decoder.decodeUrl.s(t, e ^ decoder.vkId);
    },
  },
};
