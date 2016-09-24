var utils = require('./utils');

if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

require('./extras');

// Single context.
var context;

/**
 * Audio visualizer system for A-Frame. Share AnalyserNodes between components that share the
 * the `src`.
 */
AFRAME.registerSystem('audio-visualizer', {
  init: function () {
    this.analysers = {};
  },

  getOrCreateAnalyser: function (data) {
    if (!context) { context = new AudioContext(); }
    var analysers = this.analysers;
    var analyser = context.createAnalyser();
    var audioEl = data.src;
    var src = audioEl.getAttribute('src');

    if (analysers[src]) { return analysers[src]; }

    var source = context.createMediaElementSource(audioEl)
    source.connect(analyser);
    analyser.connect(context.destination);
    analyser.smoothingTimeConstant = data.smoothingTimeConstant;
    analyser.fftSize = data.fftSize;

    // Store.
    analysers[src] = analyser;
    return analysers[src];
  }
});

/**
 * Audio visualizer component for A-Frame using AnalyserNode.
 */
AFRAME.registerComponent('audio-visualizer', {
  schema: {
    fftSize: {default: 2048},
    smoothingTimeConstant: {default: 0.8},
    src: {type: 'selector'},
    unique: {default: false}
  },

  init: function () {
    this.analyser = null;
    this.spectrum = null;
  },

  update: function () {
    var self = this;
    var data = this.data;
    var system = this.system;

    if (!data.src) { return; }

    // Get or create AnalyserNode.
    if (data.unique) {
      emit(system.createAnalyser(data));
    } else {
      emit(system.getOrCreateAnalyser(data));
    }

    function emit (analyser) {
      self.analyser = analyser;
      self.spectrum = new Uint8Array(self.analyser.frequencyBinCount);
      self.el.emit('audio-analyser-ready', {analyser: analyser});
    }
  },

  /**
   * Update spectrum on each frame.
   */
  tick: function () {
    if (!this.analyser) { return; }
    this.analyser.getByteFrequencyData(this.spectrum);
  }
});

AFRAME.registerComponent('audio-visualizer-kick', {
  schema: {
    src: {type: 'selector'}
  },

  init: function () {
    var self = this;
    this.audioEl = this.data.src;
    this.peaks = null;
    this.isPlaying = false;

    // Create offline context.
    var OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var offlineContext = new OfflineContext(2, 30 * 44100, 44100);

    var request = new XMLHttpRequest();
    request.open('GET', this.audioEl.getAttribute('src'), true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
      offlineContext.decodeAudioData(request.response, function (buffer) {
        // Create buffer source.
        var source = offlineContext.createBufferSource();
        source.buffer = buffer;

        // Beats, or kicks, generally occur around the 100 to 150 hz range.
        // Below this is often the bassline. Let's focus just on that.

        // First a lowpass to remove most of the song.
        var lowpass = offlineContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 150;
        lowpass.Q.value = 1;

        // Run the output of the source through the low pass.
        source.connect(lowpass);

        // Now a highpass to remove the bassline.
        var highpass = offlineContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 100;
        highpass.Q.value = 1;

        // Run the output of the lowpass through the highpass.
        lowpass.connect(highpass);

        // Run the output of the highpass through our offline context.
        highpass.connect(offlineContext.destination);

        // Start the source and render the output into the offline conext.
        source.start(0);
        offlineContext.startRendering();
      });
    };
    request.send();

    offlineContext.oncomplete = function (e) {
      var buffer = e.renderedBuffer;
      self.peaks = utils.getPeaks([buffer.getChannelData(0), buffer.getChannelData(1)]);
      self.peaks = self.peaks.map(function toPercent (peak) {
        return peak.position / buffer.length;
      });
      console.log(self.peaks);
      self.groups = utils.getIntervals(self.peaks);
      self.isPlaying = true;
      self.audioEl.play();
      self.currentPeakIndex = 0;
    };
  },

  tick: function () {
    if (!this.peaks) { return; }

    if (this.audioEl.currentTime / this.audioEl.duration >=
        this.peaks[this.currentPeakIndex]) {
      this.el.emit('audio-visualizer-kick');
      this.currentPeakIndex = this.currentPeakIndex + 1;
    }
  }
});
