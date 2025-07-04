import type { FormValues, FileOutput } from "./types"
import Handlebars from "handlebars"
import { getMotorControllerModule, isRevController } from "./motor-controllers"
import { getMechanism, getMotorController, getWPILibMotorType } from "./config/hardware-config"
import prettier from "prettier/standalone";
import pluginJava from "prettier-plugin-java";

// Initialize Handlebars
function initializeHandlebars() {
  // add eq helper
  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  // add or helper -> stackoverflow.com/questions/13036499/handlebars-js-or-helper
  Handlebars.registerHelper("or", function() {
    // Remove the last argument (Handlebars options object)
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.some(Boolean);
  });
}
  }


// Initialize Handlebars when this module is loaded
initializeHandlebars()

// Fetch template from public directory
async function fetchTemplate(templateName: string): Promise<string> {
  try {
    // First try with .java.hbs extension
    const response = await fetch(`templates/${templateName}.java.hbs`)
    if (response.ok) {
      const body = await response.text()
      return body
    }

    // If that fails, try with .hbs extension
    const fallbackResponse = await fetch(`templates/${templateName}.hbs`)
    if (fallbackResponse.ok) {
      const body = await response.text()
      return body
    }

    throw new Error(`Failed to fetch template: ${templateName}`)
  } catch (error) {
    console.error(`Error fetching template ${templateName}:`, error)
    throw error
  }
}

// Process template using Handlebars
async function processTemplate(templateName: string, data: FormValues): Promise<string> {
  // Add additional template data
  const templateData = {
    ...data,
    isSparkController: isRevController(data.motorControllerType),
    positionUnit: data.telemetry.positionUnit,
    ntKey: data.telemetry.ntKey,
    logPosition: data.telemetry.position,
    logVelocity: data.telemetry.velocity,
    logVoltage: data.telemetry.voltage,
    logTemperature: data.telemetry.temperature,
    logCurrent: data.telemetry.current,
    enableOpenLoopRamp: (data.rampRates?.openLoop || 0) > 0,
    enableClosedLoopRamp: (data.rampRates?.closedLoop || 0) > 0,
    openLoopRampRate: data.rampRates?.openLoop || 0,
    closedLoopRampRate: data.rampRates?.closedLoop || 0,
    kS: data.feedforward?.kS || 0,
    kV: data.feedforward?.kV || 0,
    kA: data.feedforward?.kA || 0,
    kG: data.feedforward?.kG || 0,
    maxVelocity: data.maxVelocity || 1.0,
    maxAcceleration: data.maxAcceleration || 1.0,
    enableSoftLimits: !!(data.softLimits?.forward !== undefined || data.softLimits?.reverse !== undefined),
    forwardSoftLimit: data.softLimits?.forward !== undefined ? data.softLimits.forward : null,
    reverseSoftLimit: data.softLimits?.reverse !== undefined ? data.softLimits.reverse : null,
    statorCurrentLimit: data.currentLimits?.stator || 40,
    supplyCurrentLimit: data.currentLimits?.supply || 40,
    enableStatorLimit: !!(data.currentLimits?.stator && data.currentLimits.stator > 0),
    enableSupplyLimit: !!(
      data.currentLimits?.supply &&
      data.currentLimits.supply > 0 &&
      getMotorController(data.motorControllerType).supportsSupplyCurrentLimit
    ),
  }

  // Add mechanism specific parameters
  if (data.mechanismType === "Elevator" && data.elevatorParams) {
    const startingHeight = data.elevatorParams.startingHeight !== undefined ? data.elevatorParams.startingHeight : 0.0
    const hardLimitMin = data.elevatorParams.hardLimitMin !== undefined ? data.elevatorParams.hardLimitMin : 0.0
    const hardLimitMax = data.elevatorParams.hardLimitMax !== undefined ? data.elevatorParams.hardLimitMax : 1.0
    const drumRadius = data.elevatorParams.drumRadius !== undefined ? data.elevatorParams.drumRadius : 0.0254 // Default 1 inch

    // Convert mass from lbs to kg if needed
    let mass = data.elevatorParams.mass !== undefined ? data.elevatorParams.mass : 5.0
    if (data.elevatorParams.massUnit === "lbs") {
      mass = mass * 0.453592 // Convert lbs to kg
    }

    Object.assign(templateData, {
      startingHeight,
      hardLimitMin,
      hardLimitMax,
      drumRadius,
      mass,
    })
  }

  if (data.mechanismType === "Arm" && data.armParams) {
    const length = data.armParams.length !== undefined ? data.armParams.length : 1.0
    const startingPosition = data.armParams.startingPosition !== undefined ? data.armParams.startingPosition : 0.0
    const hardLimitMin = data.armParams.hardLimitMin !== undefined ? data.armParams.hardLimitMin : 0.0
    const hardLimitMax = data.armParams.hardLimitMax !== undefined ? data.armParams.hardLimitMax : 90.0

    // Convert mass from lbs to kg if needed
    let mass = data.armParams.mass !== undefined ? data.armParams.mass : 5.0
    if (data.armParams.massUnit === "lbs") {
      mass = mass * 0.453592 // Convert lbs to kg
    }

    Object.assign(templateData, {
      armLength: length,
      startingPosition,
      hardLimitMin,
      hardLimitMax,
      mass,
      startingPositionRad: (startingPosition * Math.PI) / 180,
      hardLimitMinRad: (hardLimitMin * Math.PI) / 180,
      hardLimitMaxRad: (hardLimitMax * Math.PI) / 180,
    })
  }

  // Process motor controller specific parts
  const motorControllerParts = processMotorControllerTemplate(data)
  Object.assign(templateData, motorControllerParts)

  // Process motor type specific parts
  const motorTypeParts = processMotorTypeTemplate(data)
  Object.assign(templateData, motorTypeParts)

  // Load and compile the template
  try {
    // Get the template name from the mechanism configuration
    const mechanism = getMechanism(data.mechanismType)
    const actualTemplateName = templateName === "mechanism-subsystem" ? mechanism.templateName : templateName

    const template = await fetchTemplate(actualTemplateName)
    let compiledTemplate = Handlebars.compile(template)
    let result = compiledTemplate(templateData)
    while(result.includes("{{#if"))
    {
      console.log(result)
      compiledTemplate = Handlebars.compile(result)
      result = compiledTemplate(templateData)
    }
    return result; /*prettier.format(result, {
      parser: "java",
      plugins: [pluginJava],
    })*/
  } catch (error) {
    console.error("Error processing template:", error)
    return "Error processing template: " + (error as Error).message
  }
}

// Process motor controller specific template parts
function processMotorControllerTemplate(data: FormValues): Record<string, string> {
  try {
    const motorControllerModule = getMotorControllerModule(data.motorControllerType)

    return {
      motorControllerImports: motorControllerModule.getImports(),
      motorControllerDeclaration: motorControllerModule.getDeclaration(),
      motorControllerInitialization: motorControllerModule.getInitialization(),
      motorControllerPeriodic: motorControllerModule.getPeriodic(),
      motorControllerSimulationPeriodic: motorControllerModule.getSimulationPeriodic(),
      ...motorControllerModule.getMethods(),
    }
  } catch (error) {
    console.error("Error processing motor controller template:", error)
    return {}
  }
}

// Process motor type specific template parts
function processMotorTypeTemplate(data: FormValues): Record<string, string> {
  return {
    dcMotorType: getWPILibMotorType(data.motorType),
  }
}

// Generate files using the templates
export async function generateFiles(formData: FormValues): Promise<FileOutput[]> {
  const files: FileOutput[] = []

  // Generate main subsystem file
  const subsystemFileName = `${formData.subsystemName}.java`
  const simFileName = `${formData.subsystemName}Sim.java`

  let subsystemContent = ""
  let simContent = ""

  try {
    // Get the mechanism definition
    const mechanism = getMechanism(formData.mechanismType)

    // Generate the main subsystem file
    subsystemContent = await processTemplate(mechanism.templateName, formData)

    // Generate the simulation file
    const simTemplateName = `${formData.mechanismType.toLowerCase()}-sim`
    simContent = await processTemplate(simTemplateName, formData)

    files.push({
      filename: subsystemFileName,
      content: subsystemContent,
    })

    files.push({
      filename: simFileName,
      content: simContent,
    })
  } catch (error) {
    console.error("Error generating files:", error)
    // Return error files
    files.push({
      filename: "error.txt",
      content: `Error generating files: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  return files
}
