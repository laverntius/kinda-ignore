/**
 * Divide up audio into parts.
 * Identify, for each part, what the loudest sample is in that part.
 * Sample would represent the most likely 'beat' within that part.
 * Each part is 0.5 seconds long - or 22,050 samples.
 * Gives us 60 'beats', take the loudest half of those.
 * Allows us to ignore breaks and address tracks with a BPM below 120.
 */
module.exports.getPeaks = function (data) {
  var partSize = 5500;
  var parts = data[0].length / partSize;
  var peaks = [];

  for (var i = 0; i < parts; i++) {
    var max = 0;
    for (var j = i * partSize; j < (i + 1) * partSize; j++) {
      var volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
      if (!max || (volume > max.volume)) {
        max = {position: j, volume: volume};
      }
    }
    peaks.push(max);
  }

  // Sort peaks according to volume.
  peaks.sort(function (a, b) {
    return b.volume - a.volume;
  });

  // Re-sort it back based on position.
  peaks.sort(function (a, b) {
    return a.position - b.position;
  });

  return peaks;
}

/**
 * Get all the peaks, measure the distance to other peaks to create intervals.
 * Based on the distance between those peaks (the distance of the intervals),
 * calculate the BPM of that particular interval.
 *
 * Interval that is seen the most should have the BPM that corresponds to the track itself.
 */
module.exports.getIntervals = function (peaks) {
  var groups = [];

  peaks.forEach(function (peak, index) {
    for (var i = 1; (index + i) < peaks.length && i < 10; i++) {
      var group = {
        tempo: (60 * 44100) / (peaks[index + i].position - peak.position),
        count: 1
      };

      while (group.tempo < 90) { group.tempo *= 2; }
      while (group.tempo > 180) { group.tempo /= 2; }

      group.tempo = Math.round(group.tempo);

      if (!(groups.some(function (interval) {
        return (interval.tempo === group.tempo ? interval.count++ : 0);
      }))) {
        groups.push(group);
      }
    }
  });

  return groups;
}

