/**
 * @description Clone original error properties, except for 'message' and 'stack', to the target error.
 * */
export function cloneErrorProperties(original: any, target: any): any {
    const exclude = ['message', 'stack'];
    Object.keys(original).forEach((key) => {
        if (exclude.includes(key)) return;
        target[key] = original[key];
    });
    return target;
}
