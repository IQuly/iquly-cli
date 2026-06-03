import { clearAuth, loginWithDeviceFlow, whoAmI } from "./auth.js";
import { printHeading, printKeyValue } from "./output.js";

export async function runLogin() {
    await loginWithDeviceFlow();
}

export async function runLogout() {
    await clearAuth();
    printHeading("Logged out");
}

export async function runWhoAmI() {
    printHeading("Checking authentication...");
    const user = await whoAmI();
    printKeyValue("account", user.email);
}
