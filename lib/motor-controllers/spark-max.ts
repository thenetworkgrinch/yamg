export const getImports = () => `import com.revrobotics.spark.SparkMax;
import com.revrobotics.spark.config.SparkBaseConfig.IdleMode;
import com.revrobotics.spark.config.SparkMaxConfig;
import com.revrobotics.spark.SparkBase.ResetMode;
import com.revrobotics.spark.SparkBase.PersistMode;
import com.revrobotics.spark.SparkLowLevel.MotorType;
import com.revrobotics.RelativeEncoder;
import com.revrobotics.spark.SparkClosedLoopController;`


export const getDeclaration = () => `private final SparkMax motor;
private final RelativeEncoder encoder;`

export const getInitialization = () => `SparkMaxConfig motorConfig = new SparkMaxConfig();
motor = new SparkMax(canID, MotorType.kBrushless);
motorConfig.idleMode(brakeMode ? IdleMode.kBrake : IdleMode.kCoast);

// Configure encoder
encoder = motor.getEncoder();
encoder.setPosition(0);

// Set ramp rates
{{#if enableOpenLoopRamp}}
  motorConfig.openLoopRampRate({{openLoopRampRate}});
{{/if}}
{{#if enableClosedLoopRamp}}
  motorConfig.closedLoopRampRate({{closedLoopRampRate}});
{{/if}}

// Set current limits
{{#if enableStatorLimit}}
 motorConfig.smartCurrentLimit(statorCurrentLimit);
{{/if}}

// Set soft limits
{{#if enableSoftLimits}}
  motorConfig
  .softLimit
  .forwardSoftLimit(forwardSoftLimit)
  .forwardSoftLimitEnabled(true)
  .reverseSoftLimit(reverseSoftLimit)
  .reverseSoftLimitEnabled(true);
{{/if}}

// Save configuration
motor.configure(motorConfig, ResetMode.kResetSafeParameters, PersistMode.kPersistParameters);`

export const getPeriodic = () => ``
export const getSimulationPeriodic = () => ``

export const getMethods = () => ({
  getPositionMethod: `return encoder.getPosition() / gearRatio;`,

  getVelocityMethod: `return encoder.getVelocity() / gearRatio / 60.0; // Convert from RPM to RPS`,

  setPositionMethod: `double adjustedPosition = position * gearRatio;
profiledPIDController.setReference(adjustedPosition, CANSparkBase.ControlType.kPosition, 0, 
    feedforward.calculate(getVelocity(), acceleration));`,

  setVelocityMethod: `// This code is not used for SparkMAX as they use the control loop instead
// Placeholder to satisfy the compiler
double adjustedVelocity = velocity * gearRatio * 60.0;
double ffVolts = feedforward.calculate(velocity, acceleration);`,

  setVoltageMethod: `motor.setVoltage(voltage);`,

  getVoltageMethod: `return motor.getAppliedOutput() * motor.getBusVoltage();`,

  getCurrentMethod: `return motor.getOutputCurrent();`,

  getTemperatureMethod: `return motor.getMotorTemperature();`,
})
