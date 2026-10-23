(function(){
  "use strict";
  console.log('DRONOVA components data loaded');

  window.DRONOVA_COMPONENTS = [
    { id: 'frame', category: 'structure', name: 'Frame', icon: '🧱', function: 'Provides the drone structure.', description: 'Main support body.', howItWorks: 'Supports all components.' },
    { id: 'motors', category: 'propulsion', name: 'Motors', icon: '⚙️', function: 'Generate thrust.', description: 'Spin propellers to lift and move the drone.', howItWorks: 'Convert electrical power to rotational force.' },
    { id: 'propellers', category: 'propulsion', name: 'Propellers', icon: '🪂', function: 'Push air downward to create lift.', description: 'The rotating blades accelerate air.', howItWorks: 'Newton’s third law creates lift and thrust.' },
    { id: 'battery', category: 'power', name: 'Battery', icon: '🔋', function: 'Stores power.', description: 'Provides electrical energy to motors and avionics.', howItWorks: 'Discharges current to the ESCs and flight controller.' },
    { id: 'esc', category: 'power', name: 'ESC', icon: '🔌', function: 'Controls motor speed.', description: 'Electronic speed controllers regulate brushless motors.', howItWorks: 'Switch signals quickly to adjust torque and speed.' }
  ];
})();
