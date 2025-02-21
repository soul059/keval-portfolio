import command from '../../config.json' assert {type: 'json'};

const createEducation = () : string[] => {
    let string = "";
    const education : string[] = [];
    const SPACE = "&nbsp;";

    education.push("<br>")

    command.education.forEach((ele) => {
        string += SPACE.repeat(2);
        string += ele[0];
        string += "<br>";
        string += SPACE.repeat(5);
        string += ele[1];
        string += "<br>";
        string += SPACE.repeat(5);
        string += ele[2];
        string += "<br>";
        string += "<br>";
        education.push(string);
        string = '';
    });

    education.push("<br>");
    return education
}

export const EDUCATION = createEducation()
