const EventEmitter = require('events');
const Cap = require('cap').Cap,
    decoders = require('cap').decoders,
    PROTOCOL = decoders.PROTOCOL;

const FFXIV_HEADER = Buffer.from('5252a041ff5d46e27f2a644d7b99c475', 'hex');

class Capture extends EventEmitter {
    constructor(ip) {
        super();

        let device = Cap.deviceList().find(device => {
            if(ip == null && device.name != "")
                return true;
                
            if(device.addresses.some(address => address.addr == ip))
                return true;
        });

        const c = new Cap();
        const bufSize = 10 * 1024 * 1024;
        const buffer = new Buffer(65535);

        if(device == undefined) {
            throw new Error('Supplied capture device not found.');
        }

        const linkType = c.open(device.name, 'ip and tcp', bufSize, buffer);
        c.setMinBytes && c.setMinBytes(0);

        // we only wanna listen to ethernet traffic
        if(linkType !== 'ETHERNET')
            return;

        c.on('packet', (nbytes, trunc) => {
            var eth = decoders.Ethernet(buffer);
            if(eth.info.type === PROTOCOL.ETHERNET.IPV4) {
                var ip = decoders.IPV4(buffer, eth.offset);
                if(ip.info.protocol === PROTOCOL.IP.TCP) {
                    var datalen = ip.info.totallen - ip.hdrlen;
                    var tcp = decoders.TCP(buffer, ip.offset);
                    datalen -= tcp.hdrlen;

                    let dataBuffer = buffer.slice(tcp.offset, tcp.offset + datalen);
                    let incoming = device.addresses.some(address => address.addr == ip.info.dstaddr);
                    
                    if(dataBuffer.includes(FFXIV_HEADER)) {
                        this.emit(incoming ? 'incoming' : 'outgoing', dataBuffer);
                    }
                }
            }
        });
    }
}

module.exports = Capture;