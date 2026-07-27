import { ROLAND_V8HD_ID } from '../../../shared/mixer/ids'
// ponytail: @julusian/midi has prebuilds for modern Node/arm64 and ships no default export,
// only named { Input, Output } — the old `midi` package's `midi.Input`/`midi.Output` shape.
import * as midi from '@julusian/midi'
import { MixerCommunicator } from '../../lib/MixerCommunicator'
import { Connector } from '../../../shared/mixer/interfaces'
import RolandV8HDConfiguration from '../../../shared/mixer/rolandV8HD/RolandV8HDConfiguration'

// @see https://static.roland.com/assets/media/pdf/V-8HD_reference_eng03_W.pdf
class RolandV8HDConnector implements Connector {
    configuration: RolandV8HDConfiguration
    communicator: MixerCommunicator
    queryInterval: number
    connected: boolean
    interval: any
    midi: any
    midi_input: any
    midi_output: any
    input_status: number[]
    watchdog: NodeJS.Timeout | null

    constructor(configuration: RolandV8HDConfiguration, communicator: MixerCommunicator) {
        this.configuration = configuration
        this.communicator = communicator
        this.connected = false
        this.interval = null
        this.midi = midi
        this.input_status = [0,0,0,0,0,0,0,0]
        this.watchdog = null
    }

    // Same mechanism as FeelworldConnector (:81-84, :108-131): this connector also
    // polls and expects an answer, so a poll that goes unanswered is the loss signal.
    // Without it, unplugging the V-8HD's USB cable left isConnected() true forever and
    // every tally frozen on its last state, with nothing reporting anything wrong.
    private timeoutMs(): number {
        return Math.max(1500, this.configuration.getRequestInterval() * 3)
    }

    private markConnected() {
        if (!this.connected) {
            this.connected = true
            this.communicator.notifyMixerIsConnected()
        }
    }

    private markDisconnected() {
        if (this.connected) {
            this.connected = false
            this.communicator.notifyMixerIsDisconnected()
        }
    }

    private armWatchdog() {
        if (this.watchdog) { clearTimeout(this.watchdog) }
        this.watchdog = setTimeout(() => {
            console.error("No answer from the Roland V-8HD - treating the connection as lost.")
            this.markDisconnected()
        }, this.timeoutMs())
    }

    connect() {
        console.log(`Connecting to RolandV8HD V-8HD via MIDI`)
        this.midi_input = new this.midi.Input()
        let inputPortCount = this.midi_input.getPortCount()
        // select correct port
        for(let i = 0; i < inputPortCount; i++){
          let name = this.midi_input.getPortName(i)
          if (name.includes("V-8HD")){
            this.midi_input.openPort(i)
            console.log(`Opened Midi Port ${i}: ${name}`)
            break
          }
        }

        this.midi_output = new this.midi.Output()
        let outputPortCount = this.midi_output.getPortCount()
        // select correct port
        for(let i = 0; i < outputPortCount; i++){
          let name = this.midi_output.getPortName(i)
          if (name.includes("V-8HD")){
            this.midi_output.openPort(i)
            console.log(`Opened Midi Output Port ${i}: ${name}`)
            break
          }
        }

        // do not ignore SysEx messages.
        this.midi_input.ignoreTypes(false, true, true);

        // Callback Method for Midi Input
        this.midi_input.on('message', (deltaTime, message) => {
          // any inbound message means the device is still there
          this.markConnected()
          this.armWatchdog()
          //Check tally parameter area
          if(message[8] === 12){
        		// hdmi input id in byte 11
        		let channel_idx = message[10]
        		// tally information in byte 12
        		let input_status = message[11]
            this.input_status[channel_idx] = input_status

            // only notify program status change after full iteration (8 chans)
            if(channel_idx === 7){
              this.processInputStatus(this.communicator)
            }
          }
        });

        this.interval = setInterval(this.checkRolandV8HDStatus, this.configuration.getRequestInterval(), this.communicator, this.midi_output)

        if(this.midi_input.isPortOpen() && this.midi_output.isPortOpen()){
          this.markConnected()
          this.armWatchdog()
        }else{
          console.log(`Cannot connect with RolandV8HD V-8HD. Please check connection and try again.`)
          // no port, no device: say so instead of leaving the pill on its last value
          this.communicator.notifyMixerIsDisconnected()
        }
    }

    private processInputStatus(communicator: MixerCommunicator){
      let programs: string[] = []
      let previews: string[] = []
      // iterate through input status array
      for(let i = 0; i < 8; i++){
        // process program
        if(this.input_status[i] === 1){
          programs.push(`${i + 1}`)
        }
        // process preview
        if(this.input_status[i] === 2){
          previews.push(`${i + 1}`)
        }
      }
      communicator.notifyProgramPreviewChanged(programs, previews)
    }

    private checkRolandV8HDStatus(communicator: MixerCommunicator, midi_out: any){
      // Base SysEx message to RolandV8HD V-8HD
      let sysex_msg = [0xF0, 0x41,0x10,0x00,0x00,0x00,0x68,0x11,0x0C,0x00,0x00,0x00,0x00,0x03,0x71,0xF7]
      // iterate through all 8 input chans
    	for (let i = 0; i < 8; i++){
        if (midi_out){
          midi_out.sendMessage(sysex_msg)
          // increment input channel address
      		sysex_msg[10] += 1
          // decrement checksum by 1
      		sysex_msg[14] -= 1
        }
      }
    }

    disconnect() {
      //clean interval
      clearInterval(this.interval);
      if (this.watchdog) {
        clearTimeout(this.watchdog)
        this.watchdog = null
      }
      console.log(`RolandV8HD V-8HD connection closed`);
      // optional chaining, not a bare call: connect() throws before assigning these
      // if the native midi binding fails to load, and MixerDriver.changeMixer has no
      // catch - a TypeError here would take the hub down on the next mixer switch.
      this.midi_output?.closePort()
      this.midi_input?.closePort()
      this.connected = false
      this.communicator.notifyMixerIsDisconnected()
      return true
    }

    isConnected() {
        return this.connected
    }

    static readonly ID = ROLAND_V8HD_ID
}

export default RolandV8HDConnector
