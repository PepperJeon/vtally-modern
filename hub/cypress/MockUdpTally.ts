import dgram from 'dgram'

// a mock to be used in tests. It generates network traffic like a hardware tally would do
class MockUdpTally {
  name: string
  port: number
  io?: dgram.Socket
  messages: string[] = []
  interval?: NodeJS.Timeout
  type: "udp" = "udp"

  // port is the hub's UDP tally port (UdpTallyDriver.getTallyPort()), not this
  // mock's own socket — that one always binds to 0 (whatever's free).
  constructor(name: string, port = 7411) {
    this.name = name
    this.port = port
  }

  connect() {
    
      this.io = dgram.createSocket('udp4')

      this.io.on('error', (err) => {
          console.log(`Tally ${this.name} error: ${err.stack}`)
          this.io.close()
      })
      
      this.io.on('message', (msg) => {
        this.messages.push(msg.toString().trim())
      })
      
      this.io.bind({
        port: 0,
        exclusive: false
      }, () => {
        this.interval = setInterval(() => {
          this.io.send(`tally-ho "${this.name}"`, this.port)
        }, 100)
      })
      
      return new Promise((resolve) => {
        this.io.once('message', () => {
          resolve(null) // we are connected once the first message pops in
        })
      })
  }

  disconnect() {
    this.io && this.io.close(() => {
      this.io = undefined
    })
    this.interval && clearInterval(this.interval)
  }

  log(message:string, severity: string) {
    const command = `log "${this.name}" ${severity} "${message}"`
    console.log(command)
    this.io.send(command, this.port)
  }

}

export default MockUdpTally
