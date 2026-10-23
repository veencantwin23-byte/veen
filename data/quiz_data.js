(function(){
  "use strict";

  window.DRONOVA_QUIZ_CATEGORIES = [
    { id: 'fundamentals', title: 'Drone Fundamentals', icon: '🚀', desc: 'Core concepts, terminology and basic theory.', defaultCount: 5, module: 'intro' },
    { id: 'types', title: 'Drone Types', icon: '🧭', desc: 'Different drone categories and trade-offs.', defaultCount: 5, module: 'types' },
    { id: 'components', title: 'Drone Components', icon: '🛠️', desc: 'Key part names and their functions.', defaultCount: 5, module: 'anatomy' },
    { id: 'systems', title: 'Drone Systems', icon: '🧩', desc: 'How components work together in an architecture.', defaultCount: 5, module: 'architecture' },
    { id: 'flight', title: 'Flight Principles', icon: '✈️', desc: 'Lift, drift, roll, pitch and yaw.', defaultCount: 5, module: 'mechanics' }
  ];

  window.DRONOVA_QUIZ_BANK = {
    questions: [
      {
        id: 'q-fund-1',
        category: 'fundamentals',
        difficulty: 'Beginner',
        question: 'What does UAV stand for?',
        options: ['Unmanned Aerial Vehicle', 'Unmanned Air Vehicle', 'Underwater Aircraft Vehicle', 'Urban Air Vehicle'],
        correctAnswer: 0,
        explanation: 'UAV stands for Unmanned Aerial Vehicle, which is the standard term for drones.'
      },
      {
        id: 'q-types-1',
        category: 'types',
        difficulty: 'Beginner',
        question: 'Which drone style is most common for hobby and inspection work?',
        options: ['Multirotor', 'Fixed-wing', 'Blimp', 'Helicopter'],
        correctAnswer: 0,
        explanation: 'Multirotor drones are the most common for hovering and vertical takeoff.'
      },
      {
        id: 'q-comp-1',
        category: 'components',
        difficulty: 'Beginner',
        question: 'What is the purpose of the propeller?',
        options: ['Generate lift and thrust', 'Store electrical power', 'Read signals from the controller', 'Stabilize the battery'],
        correctAnswer: 0,
        explanation: 'The propeller accelerates air downward, creating lift and thrust.'
      },
      {
        id: 'q-systems-1',
        category: 'systems',
        difficulty: 'Intermediate',
        question: 'Which system is responsible for interpreting pilot commands and adjusting motor output?',
        options: ['Flight controller', 'Battery', 'Frame', 'Landing gear'],
        correctAnswer: 0,
        explanation: 'The flight controller interprets sensor feedback and commands the motors.'
      },
      {
        id: 'q-flight-1',
        category: 'flight',
        difficulty: 'Intermediate',
        question: 'Pitch changes rotation around which axis?',
        options: ['Lateral axis', 'Vertical axis', 'Longitudinal axis', 'Diagonal axis'],
        correctAnswer: 2,
        explanation: 'Pitch is rotation around the lateral axis, causing forward or backward nose movement.'
      }
    ]
  };
})();
