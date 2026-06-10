allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

subprojects {
    val configureProject = {
        if (hasProperty("android")) {
            val android = extensions.getByName("android")
            try {
                val getNamespaceMethod = android.javaClass.getMethod("getNamespace")
                if (getNamespaceMethod.invoke(android) == null) {
                    val setNamespaceMethod = android.javaClass.getMethod("setNamespace", String::class.java)
                    val generatedNamespace = "com.gaytri.commercial.${project.name.replace("-", "_").replace(":", "_")}"
                    setNamespaceMethod.invoke(android, generatedNamespace)
                    println("Automatically injected missing namespace '$generatedNamespace' for subproject: ${project.name}")
                }
            } catch (e: Exception) {
                // Method not found or not an Android subproject
            }
        }
    }

    if (state.executed) {
        configureProject()
    } else {
        afterEvaluate {
            configureProject()
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

