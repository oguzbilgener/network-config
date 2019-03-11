'use strict';
var _ = require('lodash');

var MAC = 'ether';
var INET = 'inet';
var BCAST = 'broadcast';
var DESTINATIONS = ['default', 'link-local'];

module.exports = function (cp) {
  return function (f) {

    //  Check for platform to do different things
    if (process.platform == 'win32'){

      //  Use netsh command to get NIC information
      cp.exec('netsh interface ipv4 show config', (err, ifConfigOut, stderr) => {
        if (err)
          return f(err)
        else if (stderr)
          return f(stderr)
        else
          f(null, parseWindows(ifConfigOut.replace(/^\s+|\s+$/g, '')))
      })
    } else {

        // @todo add command timeout
        cp.exec('ifconfig', function (err, ifConfigOut, stderr) {
          if (err) {
            return f(err);
          }

          if (stderr) {
            return f(stderr);
          }

          cp.exec('route', function (err, routeOut, stderr) {
            if (err) {
              return f(err);
            }

            if (stderr) {
              return f(stderr);
            }

            f(null, parse(ifConfigOut, routeOut));
          });
        });
      };
    }
};

function parseWindows(ifConfigOut){
  return ifConfigOut.split('\n\r').map(function (inface) {
    result =  {
      name: getInterfaceName(inface),
      ip: getInterfaceIpAddr(inface),
      vlans: [],
      netmask: getInterfaceNetmaskAddr(inface),
      broadcast: getBroadcastAddr(inface),
      mac: getInterfaceMacAddr(inface),
      gateway: getGateway(inface)
    }

    //  On windows, no vlans...but always have the primary IP
    if (result.ip != null)
      result.vlans = [result.ip + '/24']
    return result
  })
}
function parse(ifConfigOut, routeOut) {
  return ifConfigOut.split('\n\n').map(function (inface) {
    var lines = inface.split('\n');

    /**
     * Format 1
     * link xx:xx HWaddr xx-xx-xx
     * link xx:xx HWaddr xx:xx:xx
     *
     * Format 1
     * inet xx:xxx.xxx.xxx.xxx mask|masque|...:xxx.xxx.xxx.xxx
     */

    const result = {
      name: getInterfaceName(lines[0]),
      ip: getInterfaceIpAddr(lines[1]),
      vlans: [],
      netmask: getInterfaceNetmaskAddr(lines[1]),
      broadcast: getBroadcastAddr(lines[1]),
      mac: getInterfaceMacAddr(lines[3]),
      gateway: getGateway(routeOut)
    }
    if (result.name.length != 0)
      result.vlans = getVlans(result.name)
    return result
  })
}
/**
 * get all VLans for this interface
 *
 * ifconfig output line:
 *   - enp0s8 :
 * 
 * @param  {string} firstLine
 * @return {string}           an array of vlans on this NIC
 */
function getVlans(nicName){
  if (process.platform == 'win32'){
    return []
  } else {
    let vlans = []
    const cp = require('child_process')
    const cmd = 'ip addr show dev ' + nicName
    const response = String.fromCharCode.apply(null,new Uint16Array(cp.execSync(cmd)))
    const lines = response.split('\n')
    lines.forEach(line => {
      line = line.trim()
      if (line.startsWith('inet ')){
        vlans.push(line.split(' ')[1])
      }
    });
    return vlans
  }
}

function getInterfaceName(line) {
  if (process.platform == 'win32'){
    const nicName = /Configuration for interface "(.*)"/.exec(line)
    return nicName[1]
  } else
    return _.first(line.split(':'));
}


/**
 * extract mac adress
 *
 * ifconfig output:
 *   - link xx:xx HWaddr xx-xx-xx
 *   - link xx:xx HWaddr xx:xx:xx
 *
 * @param  {string} firstLine
 * @return {string}           Mac address, format: "xx:xx:xx:xx:xx:xx"
 */
function getInterfaceMacAddr(firstLine) {
  if (process.platform == 'win32'){
    return null
  } else {
    if (!_.includes(firstLine, MAC)) {
      return null;
    }

    var macAddr = firstLine.trim().split(' ')[1]
    if (macAddr.split(':').length !== 6) {
      return null;
    }

    return macAddr;
  }
}

/**
 * extract ip addr
 *
 * ifconfig output:
 *   - inet xx:xxx.xxx.xxx.xxx mask|masque|...:xxx.xxx.xxx.xxx
 *
 * @param  {string} line
 * @return {string,null} xxx.xxx.xxx.xxx
 */
function getInterfaceIpAddr(line) {
  if (process.platform == 'win32'){
    const address = /IP Address: *(.*)/.exec(line)
    return address ? address[1] : null
  } else {
    if (!_.includes(line, INET)) {
      return null;
    }
    return line.trim().split(' ')[1]
  }
}

/**
 * extract netmask addr
 *
 * ifconfig output:
 *   - inet xx:xxx.xxx.xxx.xxx mask|masque|...:xxx.xxx.xxx.xxx
 *
 * @param  {string} line
 * @return {string,null} xxx.xxx.xxx.xxx
 */
function getInterfaceNetmaskAddr(line) {
  if (process.platform == 'win32'){
    const netmask = /Subnet Prefix:.*mask (.*)/.exec(line)
    return netmask ? netmask[1].slice(0,-1) : null
  } else {
    if (!_.includes(line, INET)) {
    return null;
    }
    if (!_.includes(line,'netmask'))
      return null
    return /netmask +([0-9,.]+)/.exec(line)[1]
  }
}

/**
 * extract broadcast addr
 * @param  {string} line
 * @return {string,null}      xxx.xxx.xxx.xxx
 */
function getBroadcastAddr(line) {
  if (process.platform == 'win32'){

    //  Calculcate this based on IP address and netmask
    const netmask = /Subnet Prefix:.*mask (.*)/.exec(line)
    const address = /IP Address: *(.*)/.exec(line)
    if (netmask == null || address == null)
      return null

    //  For now punt and assume CIDR/24.  Just change last byte to 255
    const broadcast = /([0-9]+\.[0-9]+\.[0-9]+\.)/.exec(address)
    return broadcast[1] + '255'
  } else {
    if (!_.includes(line, BCAST)) {
      return null;
    }
    return /broadcast +(.*)/.exec(line)[1]
  }
}


/**
 * extract gateway ip
 * @param  {string} stdout
 * @return {string,null} default gateway ip or null
 */
function getGateway(stdout) {
  if (process.platform == 'win32'){
    const gateway = /Default Gateway: *(.*)/.exec(stdout)
    return gateway ? gateway[1] : null
  } else {
    // @todo yep. this is ugly.
    return stdout
      .split('\n')
      .filter(function (line) {
        return _.some(DESTINATIONS, function (destination)  {
          return _.includes(line, destination);
        });
      })[0]
      .split(/\s+/)[1]
      .split('.')[0]
      .replace(/-/g, '.');
  }
}
