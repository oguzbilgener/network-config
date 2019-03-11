'use strict';
var _ = require('lodash');
var assert = require('assert');
var fs = require('fs');

module.exports = function (cp) {
  /**
   * Configure a network interface
   * @param  {string} name        interface name
   * @param  {object} description interface definition
   * @param  {function} f(err)
   */
  function configure(name, description, f) {
    assert(_.isString(name));
    assert(_.isPlainObject(description));

     //  If on windows, it's completely different
     if (process.platform == 'win32'){
      const cmd = 'netsh interface ipv4 set address name="' + name + '" static ' + description.ip + ' ' + description.netmask

      //  This command requires admin credentials.  As a result we can NOT simply use .exec.  Rather use this package
      //  to elevalte our permissions before we try to reconfigure the NIC
      const wincmd = require('node-windows')
      wincmd.elevate(cmd, (err, ifConfigOut, stderr) => {
        if (err)
          return f(err)
        else if (stderr)
          return f(stderr)
        else {

          // //  Change the metric on this NIC.  We don't want him being used for internet access
          // const cmd = 'netsh interface ipv4 set interface "' + name + '" metric=50'

          // //  If this fails then it's not the worst thing in the world
          // wincmd.elevate(cmd,(err, ifConfigOut, stderr) => {
          //   if (err)
          //     console.error(erro)
          //   else if (stderr)
          //     console.error(stderr)
          // })

          //  Advise him of result
          f(null)
        }
      })
    } else {

      f("Unavailable on non-Windows platforms")
    }
}
  /**
   * Add an IP addres to a network interface
   * @param  {string} name        interface name
   * @param  {object} description interface definition
   * @param  {function} f(err)
   */
  configure.addIP = function (name, description, f) {
  assert(_.isString(name));
  assert(_.isPlainObject(description));

   //  If on windows, it's completely different
   if (process.platform != 'linux'){
    return f("Available only on Linux systems")

  } else {

    const cmd = "sudo ip addr add " + description.ip + "/24 dev " + name

    cp.exec(cmd, function (err, __, stderr) {
      if (stderr && stderr.search(/File exists/i))
        err.message = 'IP address ' + description.ip + " already assigned"
      f(err || stderr || null);
    });
  }
}

  /**
   * Remove an IP addres from a network interface
   * @param  {string} name        interface name
   * @param  {object} description interface definition
   * @param  {function} f(err)
   */
  configure.removeIP = function removeIP(name, description, f) {
  assert(_.isString(name));
  assert(_.isPlainObject(description));

   //  If on windows, it's completely different
   if (process.platform != 'linux'){
    return f("Available only on Linux systems")

  } else {

    const cmd = "sudo ip addr delete " + description.ip + "/24 dev " + name

    cp.exec(cmd, function (err, __, stderr) {
      if (stderr && stderr.search(/Cannot assign/i))
        err.message = 'IP address ' + description.ip + " not current assigned"
      f(err || stderr || null);
    });
  }
}

  configure.FILE = '/etc/network/interfaces';

  return configure;
};




function replaceInterface(name, content, interfaceDescription) {
  var replaceFn = interfaceDescription.dhcp? formatDhcpConfig : formatConfig;
  return excludeInterface(name, content).trim() + '\n\n' + replaceFn(_.extend({
    name: name
  }, interfaceDescription)) + '\n';
}


function excludeInterface(name, content) {
  var without = _.curry(function (name, content) {
    return !_.includes(content, name);
  });

  return _.chain(content)
    .split('\n\n')
    .filter(without(name))
    .join('\n\n').trim();
}

var formatDhcpConfig = _.template(function () {
  /**
auto <%= name %>
iface <%= name %> inet dhcp
*/
}.toString().split('\n').slice(2, -2).join('\n'));

var formatConfig = _.template(function () {
  /**
auto <%= name %>
iface <%= name %> inet static
    address <%= ip %>
    netmask <%= netmask %>
    gateway <%= gateway %>
    */
}.toString().split('\n').slice(2, -2).join('\n'));
