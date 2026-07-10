(function () {
  const W = 430;
  const H = 760;
  const GROUND = 535;

  const COLORS = {
    ink: "#111827",
    paper: "#fff7d8",
    yellow: "#ffda14",
    purple: "#4502ff",
    pink: "#ff4d8d",
    cyan: "#27d4ff",
    red: "#dc2626",
    green: "#16a34a",
    orange: "#ff8c1a",
    gray: "#6b7280",
    dark: "#050816"
  };

  const LEVELS = [
    {
      floor: "1F",
      title: "开放工位区",
      bossName: "组长·卷王",
      theme: { sky: "#16213f", back: "#26305f", floor: "#46516f", neon: "#27d4ff" },
      bossColor: "#ff4d8d",
      bossHp: 170,
      bossAttacks: ["weeklyDart", "rush"],
      hazards: [
        { type: "laser", x: 420, y: 238, w: 220, period: 2.6, offset: 0.2 },
        { type: "conveyor", x: 760, y: GROUND + 14, w: 210, dir: -1 }
      ],
      enemies: [
        { type: "hr", x: 520 },
        { type: "bootlicker", x: 970 }
      ],
      pickups: [
        { type: "coffee", x: 680 },
        { type: "stapler", x: 1120 },
        { type: "toilet", x: 1310 }
      ]
    },
    {
      floor: "2F",
      title: "会议室",
      bossName: "主管·会霸",
      theme: { sky: "#111b2f", back: "#3f2b59", floor: "#4b435b", neon: "#ffda14" },
      bossColor: "#ffda14",
      bossHp: 200,
      bossAttacks: ["pptWave", "meetingTrap"],
      hazards: [
        { type: "laser", x: 360, y: 210, w: 260, period: 2.2, offset: 1.1 },
        { type: "laser", x: 940, y: 270, w: 220, period: 2.4, offset: 0.1 }
      ],
      enemies: [
        { type: "bootlicker", x: 610 },
        { type: "hr", x: 1050 }
      ],
      pickups: [
        { type: "stapler", x: 500 },
        { type: "coffee", x: 840 },
        { type: "toilet", x: 1240 }
      ]
    },
    {
      floor: "3F",
      title: "经理办公室",
      bossName: "经理·甩锅侠",
      theme: { sky: "#141c17", back: "#284438", floor: "#3d584a", neon: "#16a34a" },
      bossColor: "#16a34a",
      bossHp: 225,
      bossAttacks: ["blackPot", "internShield"],
      hazards: [
        { type: "conveyor", x: 390, y: GROUND + 14, w: 210, dir: 1 },
        { type: "laser", x: 820, y: 220, w: 270, period: 2.1, offset: 0.6 }
      ],
      enemies: [
        { type: "intern", x: 560 },
        { type: "hr", x: 980 },
        { type: "bootlicker", x: 1180 }
      ],
      pickups: [
        { type: "coffee", x: 700 },
        { type: "stapler", x: 1080 },
        { type: "toilet", x: 1340 }
      ]
    },
    {
      floor: "4F",
      title: "总监楼层",
      bossName: "总监·画饼大师",
      theme: { sky: "#251534", back: "#54224a", floor: "#61375d", neon: "#ff8c1a" },
      bossColor: "#ff8c1a",
      bossHp: 260,
      bossAttacks: ["pancake", "optionCheck"],
      hazards: [
        { type: "laser", x: 380, y: 240, w: 230, period: 1.9, offset: 0.8 },
        { type: "conveyor", x: 860, y: GROUND + 14, w: 260, dir: -1 }
      ],
      enemies: [
        { type: "bootlicker", x: 510 },
        { type: "hr", x: 820 },
        { type: "intern", x: 1120 }
      ],
      pickups: [
        { type: "stapler", x: 660 },
        { type: "coffee", x: 980 },
        { type: "toilet", x: 1290 }
      ]
    },
    {
      floor: "5F",
      title: "顶楼 CEO 室",
      bossName: "CEO·资本之神",
      theme: { sky: "#18080d", back: "#50202a", floor: "#3f2f39", neon: "#dc2626" },
      bossColor: "#dc2626",
      bossHp: 330,
      bossAttacks: ["scythe", "shockwave", "layoffStorm"],
      hazards: [
        { type: "laser", x: 360, y: 200, w: 270, period: 1.8, offset: 0.2 },
        { type: "laser", x: 920, y: 270, w: 250, period: 2.0, offset: 0.9 },
        { type: "conveyor", x: 690, y: GROUND + 14, w: 210, dir: 1 }
      ],
      enemies: [
        { type: "hr", x: 520 },
        { type: "bootlicker", x: 880 },
        { type: "intern", x: 1160 }
      ],
      pickups: [
        { type: "coffee", x: 610 },
        { type: "stapler", x: 1030 },
        { type: "toilet", x: 1320 }
      ]
    }
  ];

  window.GameData = { W, H, GROUND, COLORS, LEVELS };
}());
