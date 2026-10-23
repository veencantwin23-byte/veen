(function(){
  "use strict";

  window.DRONOVA_MODULES = {
    modules: [
      {
        id: 'intro',
        page: 'intro',
        title: 'Introduction',
        summary: 'A beginner-friendly overview of drone fundamentals.',
        sections: [
          { heading: 'What is a drone?', body: 'A drone is an unmanned aerial vehicle (UAV) designed to fly without a human pilot in the vehicle.' },
          { heading: 'Why learn it?', body: 'Drones combine aerodynamics, electronics, sensors, and control systems.' }
        ],
        terms: [
          { term: 'UAV', def: 'Unmanned Aerial Vehicle.' },
          { term: 'Lift', def: 'The force that keeps the drone airborne.' }
        ]
      },
      {
        id: 'types',
        page: 'types',
        title: 'Types of Drones',
        summary: 'The main categories and trade-offs between drone designs.',
        droneTypes: [
          { name: 'Multirotor', tag: 'Most common', desc: 'Rotor-based drones that are easy to control and hover.', pros: ['Stable hover', 'Vertical takeoff'], cons: ['Short flight time'], useCases: ['Aerial photography', 'Inspection'] }
        ]
      },
      {
        id: 'architecture',
        page: 'architecture',
        title: 'System Architecture',
        summary: 'The system flow from control input to movement.',
        flows: [
          {
            title: 'Pilot to movement',
            desc: 'The pilot input passes through the controller and flight stack to the motors.',
            steps: ['Pilot input', 'Flight controller', 'Motor commands', 'Lift and movement']
          }
        ],
        note: 'A drone is a coordinated system of airframe, power, electronics, and control logic.'
      },
      {
        id: 'mechanics',
        page: 'mechanics',
        title: 'How a Drone Flies',
        summary: 'How lift, drag, thrust and control axes shape drone motion.',
        forces: [
          { name: 'Thrust', icon: '🚀', desc: 'Pushes the drone forward or upward via propeller force.' },
          { name: 'Lift', icon: '🛫', desc: 'Counteracts weight and allows flight.' },
          { name: 'Weight', icon: '⚖️', desc: 'Downward force due to gravity.' },
          { name: 'Drag', icon: '🌬️', desc: 'Air resistance that slows motion.' }
        ],
        axes: [
          { name: 'Pitch', icon: '↕️', desc: 'Tilts the drone forward and backward.' },
          { name: 'Roll', icon: '↔️', desc: 'Tilts left and right.' },
          { name: 'Yaw', icon: '⟳️', desc: 'Rotates the drone around its vertical axis.' }
        ],
        controls: [
          { name: 'Throttle', icon: '🔺', desc: 'Increases or reduces overall lift.' },
          { name: 'Yaw', icon: '🧭', desc: 'Rotates the drone.' }
        ]
      },
      {
        id: 'applications',
        page: 'applications',
        title: 'Applications',
        summary: 'Drones are used across practical and strategic domains.',
        apps: [
          { name: 'Mapping', icon: '🗺️', desc: 'Create aerial maps and terrain models.' },
          { name: 'Inspection', icon: '🔍', desc: 'Inspect infrastructure, rooftops, and industrial sites.' },
          { name: 'Search & Rescue', icon: '🚨', desc: 'Locate missing people or hazards from the air.' }
        ]
      }
    ]
  };
})();
