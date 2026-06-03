export function printHeading(text) {
    console.log(text);
}
export function printBlankLine() {
    console.log("");
}
export function printKeyValue(label, value) {
    console.log(`${label}: ${value}`);
}
export function printList(items) {
    for (const item of items) {
        console.log(`- ${item}`);
    }
}
