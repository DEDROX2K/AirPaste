import { getTileRegistration } from "./tiles/tileRegistry";

export default function Card(props) {
  const registration = getTileRegistration(props.card.type);
  const TileComponent = registration.Component;

  return <TileComponent {...props} />;
}
